import { expect, test } from "bun:test";
import { mockAdapter } from "@photo-studio/ai";
import type { JobDto, PipelineDto } from "@photo-studio/schemas";
import { studioFixture } from "../test/studio";
import { runPlanStage } from "./pipeline";
import { runGenerationStage } from "./generation";

type Fixture = Awaited<ReturnType<typeof studioFixture>>;
function beforeStatement(
  s: Fixture,
  matches: (sql: string) => boolean,
  intercept: () => void,
) {
  const prepare = s.env.DB.prepare.bind(s.env.DB);
  let intercepted = false;
  s.env.DB.prepare = (sql) => {
    if (!intercepted && matches(sql)) {
      intercepted = true;
      intercept();
    }
    return prepare(sql);
  };
  return () => expect(intercepted).toBe(true);
}
function cancel(s: Fixture, id: string) {
  s.sqlite
    .query("UPDATE generation_jobs SET status='cancelled' WHERE id=?")
    .run(id);
}
const status = (s: Fixture, id: string) =>
  s.sqlite.query("SELECT status FROM generation_jobs WHERE id=?").get(id);

test("cancellation or deletion between the active read and paid claim never calls the provider or revives the job", async () => {
  for (const mutation of ["cancel", "product", "user"] as const) {
    const s = await studioFixture();
    const job = await s.startPlan();
    const intercepted = beforeStatement(
      s,
      (sql) => sql.startsWith("INSERT OR IGNORE INTO generation_attempts"),
      () => {
        if (mutation === "cancel") cancel(s, job.id);
        else if (mutation === "product")
          s.sqlite
            .query("UPDATE products SET status='deleting' WHERE id=?")
            .run(s.product.id);
        else s.sqlite.query("UPDATE users SET status='deleting'").run();
      },
    );
    const adapter = mockAdapter();
    let calls = 0;
    adapter.analyze = async () => {
      calls++;
      throw new Error("A cancelled claim must never invoke the provider");
    };
    await runPlanStage(s.env, job.id, "analysis", {
      adapter: async () => adapter,
    });
    intercepted();
    expect(calls).toBe(0);
    expect(
      s.sqlite.query("SELECT count(*) n FROM generation_attempts").get(),
    ).toEqual({ n: 0 });
    expect(status(s, job.id)).toEqual({
      status: mutation === "cancel" ? "cancelled" : "failed",
    });
  }
});

test("cancellation immediately after a claim stops before inference and records a known uninvoked attempt", async () => {
  const s = await studioFixture();
  const job = await s.startPlan();
  const batch = s.env.DB.batch.bind(s.env.DB);
  let cancelled = false;
  s.env.DB.batch = async <T = unknown>(statements: D1PreparedStatement[]) => {
    const result = await batch<T>(statements);
    if (
      !cancelled &&
      (
        s.sqlite.query("SELECT count(*) n FROM generation_attempts").get() as {
          n: number;
        } | null
      )?.n === 1
    ) {
      cancelled = true;
      cancel(s, job.id);
      s.sqlite
        .query(
          "UPDATE generation_attempts SET status='outcome_unknown' WHERE job_id=? AND status='started'",
        )
        .run(job.id);
    }
    return result;
  };
  const adapter = mockAdapter();
  let calls = 0;
  adapter.analyze = async () => {
    calls++;
    throw new Error("The provider must not receive this cancelled call");
  };
  await runPlanStage(s.env, job.id, "analysis", {
    adapter: async () => adapter,
  });
  expect(cancelled).toBe(true);
  expect(calls).toBe(0);
  expect(status(s, job.id)).toEqual({ status: "cancelled" });
  expect(
    s.sqlite
      .query("SELECT status,actual_cost_usd FROM generation_attempts")
      .get(),
  ).toEqual({ status: "failed", actual_cost_usd: null });
});

test("a completed provider response retains its known usage when cancellation prevents analysis persistence", async () => {
  const s = await studioFixture();
  const job = await s.startPlan();
  const adapter = mockAdapter();
  const analyze = adapter.analyze;
  let calls = 0;
  adapter.analyze = async (...args) => {
    calls++;
    const result = await analyze(...args);
    cancel(s, job.id);
    return { ...result, usage: { ...result.usage, actualCostUsd: 0.002 } };
  };
  const deps = { adapter: async () => adapter };
  await runPlanStage(s.env, job.id, "analysis", deps);
  await runPlanStage(s.env, job.id, "analysis", deps);
  expect(calls).toBe(1);
  expect(status(s, job.id)).toEqual({ status: "cancelled" });
  expect(
    s.sqlite
      .query("SELECT status,actual_cost_usd FROM generation_attempts")
      .get(),
  ).toEqual({ status: "succeeded", actual_cost_usd: 0.002 });
  expect(
    s.sqlite
      .query("SELECT analysis_json FROM products WHERE id=?")
      .get(s.product.id),
  ).toEqual({ analysis_json: null });
});

test("a cancellation before plan persistence cannot publish a new plan or completed job", async () => {
  const s = await studioFixture();
  const job = await s.startPlan();
  await runPlanStage(s.env, job.id, "analysis");
  const intercepted = beforeStatement(
    s,
    (sql) => sql.startsWith("INSERT OR IGNORE INTO shoot_plans"),
    () => cancel(s, job.id),
  );
  await runPlanStage(s.env, job.id, "planning");
  intercepted();
  expect(status(s, job.id)).toEqual({ status: "cancelled" });
  expect(s.sqlite.query("SELECT count(*) n FROM shoot_plans").get()).toEqual({
    n: 0,
  });
  expect(
    s.sqlite
      .query("SELECT status FROM generation_attempts WHERE stage='planning'")
      .get(),
  ).toEqual({ status: "succeeded" });
});

test("cancellation at final generation publication cannot replace cancelled with needs_review or repeat a paid call", async () => {
  const s = await studioFixture();
  const planning = await s.startPlan();
  await runPlanStage(s.env, planning.id, "analysis");
  await runPlanStage(s.env, planning.id, "planning");
  const plan = (await s.call<PipelineDto>(`/products/${s.product.id}/pipeline`))
    .data.plans[0];
  if (!plan) throw new Error("Missing synthetic plan");
  const job = (
    await s.call<JobDto>(`/products/${s.product.id}/generate`, "POST", {
      consent: true,
      idempotencyKey: crypto.randomUUID(),
      planId: plan.id,
      quality: "medium",
      count: 1,
    })
  ).data;
  const intercepted = beforeStatement(
    s,
    (sql) =>
      sql.startsWith(
        "UPDATE generation_jobs SET status=?,stage=?,finished_at=?",
      ),
    () => cancel(s, job.id),
  );
  const adapter = mockAdapter();
  const generate = adapter.generate;
  let calls = 0;
  adapter.generate = async (...args) => {
    calls++;
    const result = await generate(...args);
    return { ...result, usage: { ...result.usage, actualCostUsd: 0.01 } };
  };
  const deps = { adapter: async () => adapter };
  await runGenerationStage(s.env, job.id, "generation", deps);
  await runGenerationStage(s.env, job.id, "generation", deps);
  intercepted();
  expect(calls).toBe(1);
  expect(status(s, job.id)).toEqual({ status: "cancelled" });
  expect(
    s.sqlite
      .query(
        "SELECT status,actual_cost_usd FROM generation_attempts WHERE stage='generation'",
      )
      .get(),
  ).toEqual({ status: "succeeded", actual_cost_usd: 0.01 });
});
