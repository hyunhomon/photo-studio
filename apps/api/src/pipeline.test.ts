import { expect, test } from "bun:test";
import {
  mockAdapter,
  ProviderError,
  InvalidOutputError,
  unknownUsage,
} from "@photo-studio/ai";
import type { PipelineDto, ProductDto } from "@photo-studio/schemas";
import { studioFixture } from "../test/studio";
import { runPlanStage } from "./pipeline";

test("failed billed planning preserves analysis and safe diagnostics; consented planning-only recovery snapshots analysis without re-analysing", async () => {
  const s = await studioFixture();
  expect(
    (
      await s.call(`/products/${s.product.id}/plan`, "POST", {
        ...s.planInput,
        reuseAnalysis: true,
      })
    ).status,
  ).toBe(409);
  const job = await s.startPlan();
  const adapter = mockAdapter(),
    originalPlan = adapter.plan;
  let analyses = 0,
    plans = 0;
  const analyze = adapter.analyze;
  adapter.analyze = async (...args) => {
    analyses++;
    return analyze(...args);
  };
  adapter.plan = async () => {
    plans++;
    throw new InvalidOutputError(
      { ...unknownUsage, actualCostUsd: 0.0000965 },
      {
        reason: "schema_mismatch",
        issues: [{ field: "lighting", code: "invalid_type" }],
      },
    );
  };
  const deps = { adapter: async () => adapter };
  await runPlanStage(s.env, job.id, "analysis", deps);
  await runPlanStage(s.env, job.id, "planning", deps);
  expect(
    s.sqlite.query("SELECT status,error_code FROM generation_jobs").get(),
  ).toEqual({ status: "failed", error_code: "INVALID_PROVIDER_OUTPUT" });
  const failed = s.sqlite
    .query(
      "SELECT actual_cost_usd,output_json FROM generation_attempts WHERE stage='planning'",
    )
    .get() as { actual_cost_usd: number; output_json: string };
  expect(failed.actual_cost_usd).toBe(0.0000965);
  expect(JSON.parse(failed.output_json)).toEqual({
    validation: {
      reason: "schema_mismatch",
      issues: [{ field: "lighting", code: "invalid_type" }],
    },
  });
  const input = {
    ...s.planInput,
    idempotencyKey: crypto.randomUUID(),
    reuseAnalysis: true,
  };
  expect(
    (
      await s.call(`/products/${s.product.id}/plan`, "POST", {
        ...input,
        consent: false,
      })
    ).status,
  ).toBe(400);
  const started = await s.call<{ id: string }>(
    `/products/${s.product.id}/plan`,
    "POST",
    input,
  );
  expect(started.status).toBe(202);
  const retry = started.data.id;
  expect(
    (
      await s.call<{ id: string }>(
        `/products/${s.product.id}/plan`,
        "POST",
        input,
      )
    ).data.id,
  ).toBe(retry);
  const b = await s.login();
  expect(
    (await s.call(`/products/${s.product.id}/plan`, "POST", input, b)).status,
  ).toBe(404);
  adapter.plan = async (...args) => {
    plans++;
    expect(args[1].garmentType).toBe("shirt");
    return originalPlan(...args);
  };
  // Snapshot remains authoritative even if storage changes after queueing.
  s.sqlite.run(
    "UPDATE products SET analysis_json=json_set(analysis_json,'$.garmentType','changed-after-queue') WHERE id=?",
    [s.product.id],
  );
  await runPlanStage(s.env, retry, "analysis", deps);
  await runPlanStage(s.env, retry, "planning", deps);
  await runPlanStage(s.env, retry, "planning", deps);
  expect(analyses).toBe(1);
  expect(plans).toBe(2);
  expect(
    s.sqlite
      .query("SELECT count(*) n FROM generation_attempts WHERE job_id=?")
      .get(retry),
  ).toEqual({ n: 1 });
  expect(
    s.sqlite.query("SELECT status FROM generation_jobs WHERE id=?").get(retry),
  ).toEqual({ status: "completed" });
});

test("consent, idempotency, owner scope, durable analysis/planning and manual approval", async () => {
  const s = await studioFixture();
  expect(
    (
      await s.call(`/products/${s.product.id}/plan`, "POST", {
        ...s.planInput,
        consent: false,
      })
    ).status,
  ).toBe(400);
  const job = await s.startPlan();
  expect(job.status).toBe("queued");
  expect((await s.startPlan()).id).toBe(job.id);
  expect(s.workflows.length).toBe(1);
  expect(
    (
      await s.call(`/products/${s.product.id}/plan`, "POST", {
        ...s.planInput,
        description: "different",
      })
    ).status,
  ).toBe(409);
  const b = await s.login();
  expect((await s.call(`/jobs/${job.id}`, "GET", undefined, b)).status).toBe(
    404,
  );
  let count = 0;
  const adapter = mockAdapter();
  const original = adapter.analyze;
  adapter.analyze = async (...args) => {
    count++;
    return original(...args);
  };
  const deps = { adapter: async () => adapter };
  await runPlanStage(s.env, job.id, "analysis", deps);
  await runPlanStage(s.env, job.id, "analysis", deps);
  expect(count).toBe(1);
  await runPlanStage(s.env, job.id, "planning", deps);
  const pipeline = (
    await s.call<PipelineDto>(`/products/${s.product.id}/pipeline`)
  ).data;
  expect(pipeline.jobs[0]?.status).toBe("completed");
  expect(pipeline.jobs[0]?.attempts.length).toBe(2);
  expect(
    pipeline.jobs[0]?.attempts.every((a) => a.actualCostUsd === null),
  ).toBe(true);
  const plan = pipeline.plans[0];
  if (!plan) throw new Error("Missing synthetic plan");
  expect(plan.status).toBe("draft");
  expect(
    (
      await s.call(
        `/plans/${plan.id}`,
        "PATCH",
        { spec: plan.spec, approved: true },
        b,
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await s.call(`/plans/${plan.id}`, "PATCH", {
        spec: plan.spec,
        approved: true,
      })
    ).status,
  ).toBe(200);
  const p = (await s.call<ProductDto>(`/products/${s.product.id}`)).data;
  expect(
    (
      await s.call(`/products/${p.id}/analysis`, "PATCH", {
        ...p.analysis,
        garmentType: "confirmed shirt",
      })
    ).status,
  ).toBe(200);
  expect(
    (await s.call<PipelineDto>(`/products/${p.id}/pipeline`)).data.plans[0]
      ?.status,
  ).toBe("draft");
  expect((await s.call(`/assets/${p.assets[0]?.id}`, "DELETE")).status).toBe(
    409,
  );
});
test("uncertain paid response, unsupported capability and pre-existing claim never repeat inference", async () => {
  const s = await studioFixture(),
    job = await s.startPlan();
  let calls = 0;
  const adapter = mockAdapter();
  adapter.analyze = async () => {
    calls++;
    throw new ProviderError("PROVIDER_OUTCOME_UNKNOWN", true);
  };
  await runPlanStage(s.env, job.id, "analysis", {
    adapter: async () => adapter,
  });
  await runPlanStage(s.env, job.id, "analysis", {
    adapter: async () => adapter,
  });
  await runPlanStage(s.env, job.id, "planning", {
    adapter: async () => adapter,
  });
  expect(calls).toBe(1);
  expect(s.sqlite.query("SELECT status FROM generation_jobs").get()).toEqual({
    status: "outcome_unknown",
  });
  const t = await studioFixture(),
    j = await t.startPlan();
  adapter.preflight = async () => {
    throw new ProviderError("MODEL_CAPABILITY_UNSUPPORTED");
  };
  await runPlanStage(t.env, j.id, "analysis", { adapter: async () => adapter });
  expect(
    t.sqlite.query("SELECT count(*) n FROM generation_attempts").get(),
  ).toEqual({ n: 0 });
  expect(calls).toBe(1);
  const u = await studioFixture(),
    k = await u.startPlan();
  u.sqlite.run(
    "INSERT INTO generation_attempts (id,user_id,job_id,stage,model,status,request_hash,prompt_version,created_at) SELECT 'synthetic-claim',user_id,id,'analysis','mock','started',request_hash,'v1',0 FROM generation_jobs",
  );
  adapter.preflight = async () => {};
  adapter.analyze = async () => {
    calls++;
    throw new Error("Unexpected inference");
  };
  await runPlanStage(u.env, k.id, "analysis", { adapter: async () => adapter });
  expect(calls).toBe(1);
  expect(u.sqlite.query("SELECT status FROM generation_jobs").get()).toEqual({
    status: "outcome_unknown",
  });
});
