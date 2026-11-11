import { expect, test, spyOn } from "bun:test";
import { mockAdapter, ProviderError } from "@photo-studio/ai";
import type { PipelineDto, ResultDto, JobDto } from "@photo-studio/schemas";
import { studioFixture } from "../test/studio";
import { runPlanStage } from "./pipeline";
import { runGenerationStage } from "./generation";
async function ready() {
  const s = await studioFixture(),
    j = await s.startPlan();
  await runPlanStage(s.env, j.id, "analysis");
  await runPlanStage(s.env, j.id, "planning");
  const plan = (await s.call<PipelineDto>(`/products/${s.product.id}/pipeline`))
    .data.plans[0];
  if (!plan) throw new Error("Missing fixture plan");
  const input = {
    consent: true,
    idempotencyKey: crypto.randomUUID(),
    planId: plan.id,
    quality: "medium",
    count: 1,
    regenerationOf: null,
    regenerationReason: null,
  };
  return {
    ...s,
    plan,
    input,
    approve: () =>
      s.call(`/plans/${plan.id}`, "PATCH", { spec: plan.spec, approved: true }),
    generate: () =>
      s.call<JobDto>(`/products/${s.product.id}/generate`, "POST", input),
  };
}
test("approved generation, nullable costs, compare/download, human feedback and regeneration lineage", async () => {
  const s = await ready();
  expect((await s.generate()).status).toBe(409);
  await s.approve();
  expect(
    (
      await s.call(`/products/${s.product.id}/generate`, "POST", {
        ...s.input,
        consent: false,
      })
    ).status,
  ).toBe(400);
  const job = (await s.generate()).data;
  expect((await s.generate()).data.id).toBe(job.id);
  expect(s.workflows.length).toBe(2);
  let calls = 0;
  const adapter = mockAdapter(),
    original = adapter.generate;
  adapter.generate = async (...args) => {
    calls++;
    return original(...args);
  };
  const deps = { adapter: async () => adapter };
  await runGenerationStage(s.env, job.id, "generation", deps);
  await runGenerationStage(s.env, job.id, "generation", deps);
  expect(calls).toBe(1);
  await runGenerationStage(s.env, job.id, "evaluation", deps);
  const results = (
    await s.call<ResultDto[]>(`/products/${s.product.id}/results`)
  ).data;
  expect(results.length).toBe(1);
  const result = results[0];
  if (!result) throw new Error("Missing fixture result");
  expect(result.quality?.needsHumanReview).toBe(true);
  expect(result.feedback).toBeNull();
  expect(
    s.sqlite
      .query("SELECT status FROM generation_jobs WHERE kind='generate'")
      .get(),
  ).toEqual({ status: "needs_review" });
  const b = await s.login();
  expect(
    (await s.call(`/products/${s.product.id}/results`, "GET", undefined, b))
      .status,
  ).toBe(404);
  expect(
    (
      await s.call(
        `/assets/${result.asset.id}/feedback`,
        "POST",
        { decision: "accepted" },
        b,
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await s.call(`/assets/${result.asset.id}/feedback`, "POST", {
        decision: "rejected",
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await s.call(`/assets/${result.asset.id}/feedback`, "POST", {
        decision: "accepted",
      })
    ).status,
  ).toBe(201);
  expect(
    (
      await s.call(`/assets/${result.asset.id}/feedback`, "POST", {
        decision: "rejected",
        reason: "color_change",
        note: "Synthetic feedback",
      })
    ).status,
  ).toBe(201);
  expect(
    (await s.call<ResultDto[]>(`/products/${s.product.id}/results`)).data[0]
      ?.feedback?.decision,
  ).toBe("rejected");
  const regenerated = (
    await s.call<JobDto>(`/products/${s.product.id}/generate`, "POST", {
      ...s.input,
      idempotencyKey: crypto.randomUUID(),
      regenerationOf: result.asset.id,
      regenerationReason: "color_change",
    })
  ).data;
  await runGenerationStage(s.env, regenerated.id, "generation");
  await runGenerationStage(s.env, regenerated.id, "evaluation");
  expect(
    (await s.call<ResultDto[]>(`/products/${s.product.id}/results`)).data[0]
      ?.regenerationOf,
  ).toBe(result.asset.id);
  const download = await s.app.request(
    `/api/v1/assets/${result.asset.id}/download`,
    { headers: s.headers },
    s.env,
  );
  expect(download.status).toBe(200);
  expect(download.headers.get("content-disposition")).toContain("attachment");
  await s.call(`/projects/${s.project.id}`, "DELETE");
  expect(s.objects.size).toBe(0);
  expect(
    s.sqlite.query("SELECT count(*) n FROM generation_attempts").get(),
  ).toEqual({ n: 0 });
});
test("R2 failure after paid response retains reported cost and never repeats generation", async () => {
  const s = await ready();
  await s.approve();
  const job = (await s.generate()).data;
  let calls = 0;
  const adapter = mockAdapter(),
    original = adapter.generate;
  adapter.generate = async (...args) => {
    calls++;
    const r = await original(...args);
    return { ...r, usage: { ...r.usage, actualCostUsd: 0.0123 } };
  };
  const failure = spyOn(s.env.ASSETS, "put").mockRejectedValue(
    new Error("Synthetic storage failure"),
  );
  await runGenerationStage(s.env, job.id, "generation", {
    adapter: async () => adapter,
  });
  failure.mockRestore();
  await runGenerationStage(s.env, job.id, "generation", {
    adapter: async () => adapter,
  });
  expect(calls).toBe(1);
  expect(
    s.sqlite
      .query(
        "SELECT status,actual_cost_usd FROM generation_attempts WHERE stage='generation'",
      )
      .get(),
  ).toEqual({ status: "outcome_unknown", actual_cost_usd: 0.0123 });
  expect(
    s.sqlite
      .query("SELECT status FROM generation_jobs WHERE kind='generate'")
      .get(),
  ).toEqual({ status: "outcome_unknown" });
});
test("evaluation failure retains image and permits manual review without retrying evaluation", async () => {
  const s = await ready();
  await s.approve();
  const job = (await s.generate()).data;
  await runGenerationStage(s.env, job.id, "generation");
  let calls = 0;
  const adapter = mockAdapter();
  adapter.evaluate = async () => {
    calls++;
    throw new ProviderError("INSUFFICIENT_PROVIDER_CREDIT");
  };
  await runGenerationStage(s.env, job.id, "evaluation", {
    adapter: async () => adapter,
  });
  await runGenerationStage(s.env, job.id, "evaluation", {
    adapter: async () => adapter,
  });
  expect(calls).toBe(1);
  const result = (
    await s.call<ResultDto[]>(`/products/${s.product.id}/results`)
  ).data[0];
  expect(result?.quality).toBeNull();
  expect(
    s.sqlite
      .query("SELECT status FROM generation_jobs WHERE kind='generate'")
      .get(),
  ).toEqual({ status: "evaluation_failed" });
  expect(
    (
      await s.call(`/assets/${result?.asset.id}/feedback`, "POST", {
        decision: "accepted",
      })
    ).status,
  ).toBe(201);
});

test("deletion during a generation response prevents late image resurrection", async () => {
  const s = await ready();
  await s.approve();
  const job = (await s.generate()).data;
  const adapter = mockAdapter(),
    original = adapter.generate;
  adapter.generate = async (...args) => {
    const result = await original(...args);
    await s.call(`/projects/${s.project.id}`, "DELETE");
    return result;
  };
  await runGenerationStage(s.env, job.id, "generation", {
    adapter: async () => adapter,
  });
  expect(s.objects.size).toBe(0);
  expect(s.sqlite.query("SELECT count(*) n FROM assets").get()).toEqual({
    n: 0,
  });
});
