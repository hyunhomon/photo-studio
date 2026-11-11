import { expect, test } from "bun:test";
import { mockAdapter, ProviderError } from "@photo-studio/ai";
import type { PipelineDto, ProductDto } from "@photo-studio/schemas";
import { studioFixture } from "../test/studio";
import { runPlanStage } from "./pipeline";

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
