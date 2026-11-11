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
import { referenceForm } from "../test/references";

test("a consented look reference informs planning once, stays out of garment analysis and is inherited by the saved plan", async () => {
  const s = await studioFixture();
  const uploaded = await s.call<ProductDto>(
    `/products/${s.product.id}/references`,
    "POST",
    referenceForm("look_reference"),
  );
  const reference = uploaded.data.assets.find(
    (a) => a.kind === "look_reference",
  );
  const source = uploaded.data.assets.find((a) => a.kind === "input");
  if (!reference || !source) throw new Error("Missing synthetic reference");
  const request = {
    ...s.planInput,
    lookReferenceId: reference.id,
    referenceConsent: true,
  };
  expect(
    (
      await s.call(`/products/${s.product.id}/plan`, "POST", {
        ...request,
        referenceConsent: false,
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await s.call(`/products/${s.product.id}/plan`, "POST", {
        ...request,
        lookReferenceId: source.id,
      })
    ).status,
  ).toBe(404);
  expect(
    s.sqlite.query("SELECT count(*) n FROM generation_attempts").get(),
  ).toEqual({ n: 0 });
  const job = (
    await s.call<{ id: string }>(
      `/products/${s.product.id}/plan`,
      "POST",
      request,
    )
  ).data;
  const adapter = mockAdapter(),
    analyze = adapter.analyze,
    plan = adapter.plan;
  let analysisCalls = 0,
    planningCalls = 0;
  adapter.analyze = async (...args) => {
    analysisCalls++;
    expect(args[1]).toHaveLength(1);
    return analyze(...args);
  };
  adapter.plan = async (...args) => {
    planningCalls++;
    expect(args[4]?.lookImage).toStartWith("data:image/png;base64,");
    return plan(...args);
  };
  const deps = { adapter: async () => adapter };
  await runPlanStage(s.env, job.id, "analysis", deps);
  await runPlanStage(s.env, job.id, "planning", deps);
  expect(analysisCalls).toBe(1);
  expect(planningCalls).toBe(1);
  const saved = (
    await s.call<PipelineDto>(`/products/${s.product.id}/pipeline`)
  ).data.plans[0];
  expect(saved?.lookReferenceId).toBe(reference.id);
  expect(saved?.spec.referenceNotes).toContain("Mock");
  expect(
    s.sqlite
      .query("SELECT stage FROM generation_attempts ORDER BY stage")
      .all(),
  ).toEqual([{ stage: "analysis" }, { stage: "planning" }]);
  const stranger = await s.login();
  expect(
    (
      await s.call(
        `/products/${s.product.id}/plan`,
        "POST",
        { ...request, idempotencyKey: crypto.randomUUID() },
        stranger,
      )
    ).status,
  ).toBe(404);
});

test("missing look media or revoked reference consent stops planning before a paid planning claim", async () => {
  const s = await studioFixture();
  const uploaded = await s.call<ProductDto>(
    `/products/${s.product.id}/references`,
    "POST",
    referenceForm("look_reference"),
  );
  const ref = uploaded.data.assets.find((a) => a.kind === "look_reference");
  if (!ref) throw new Error("Missing fixture reference");
  const job = (
    await s.call<{ id: string }>(`/products/${s.product.id}/plan`, "POST", {
      ...s.planInput,
      lookReferenceId: ref.id,
      referenceConsent: true,
    })
  ).data;
  await runPlanStage(s.env, job.id, "analysis");
  const key = s.sqlite
    .query("SELECT r2_key FROM assets WHERE id=?")
    .get(ref.id) as { r2_key: string };
  s.objects.delete(key.r2_key);
  let calls = 0;
  const adapter = mockAdapter();
  adapter.plan = async () => {
    calls++;
    throw new Error("Must not call missing reference");
  };
  await runPlanStage(s.env, job.id, "planning", {
    adapter: async () => adapter,
  });
  expect(calls).toBe(0);
  expect(
    s.sqlite
      .query(
        "SELECT count(*) n FROM generation_attempts WHERE stage='planning'",
      )
      .get(),
  ).toEqual({ n: 0 });
  const revoked = await studioFixture();
  const refProduct = await revoked.call<ProductDto>(
    `/products/${revoked.product.id}/references`,
    "POST",
    referenceForm("look_reference"),
  );
  const look = refProduct.data.assets.find((a) => a.kind === "look_reference");
  if (!look) throw new Error("Missing fixture reference");
  const revokedJob = (
    await revoked.call<{ id: string }>(
      `/products/${revoked.product.id}/plan`,
      "POST",
      {
        ...revoked.planInput,
        lookReferenceId: look.id,
        referenceConsent: true,
      },
    )
  ).data;
  revoked.sqlite.run(
    "UPDATE generation_jobs SET request_json=json_set(request_json,'$.referenceConsent',json('false')) WHERE id=?",
    [revokedJob.id],
  );
  let resolutions = 0;
  await runPlanStage(revoked.env, revokedJob.id, "analysis", {
    adapter: async () => {
      resolutions++;
      return mockAdapter();
    },
  });
  expect(resolutions).toBe(0);
  expect(
    revoked.sqlite.query("SELECT count(*) n FROM generation_attempts").get(),
  ).toEqual({ n: 0 });
});

test("combined garment and planning reference size is rejected before any job or paid call", async () => {
  const s = await studioFixture();
  const uploaded = await s.call<ProductDto>(
    `/products/${s.product.id}/references`,
    "POST",
    referenceForm("look_reference"),
  );
  const ref = uploaded.data.assets.find((a) => a.kind === "look_reference");
  if (!ref) throw new Error("Missing fixture reference");
  s.sqlite.run(
    "UPDATE assets SET size_bytes=? WHERE product_id=? AND kind='input'",
    [9 * 1024 * 1024, s.product.id],
  );
  s.sqlite.run("UPDATE assets SET size_bytes=? WHERE id=?", [
    4 * 1024 * 1024,
    ref.id,
  ]);
  const request = await s.call(`/products/${s.product.id}/plan`, "POST", {
    ...s.planInput,
    lookReferenceId: ref.id,
    referenceConsent: true,
  });
  expect(request.status).toBe(409);
  expect(request.error?.code).toBe("SOURCE_TOO_LARGE");
  expect(
    s.sqlite.query("SELECT count(*) n FROM generation_jobs").get(),
  ).toEqual({ n: 0 });
  expect(
    s.sqlite.query("SELECT count(*) n FROM generation_attempts").get(),
  ).toEqual({ n: 0 });
});

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

test("automatic titles use the consented analysis only and never overwrite a concurrent manual rename", async () => {
  const s = await studioFixture();
  s.sqlite.run("UPDATE products SET name='새 상품',name_source='auto'");
  const job = (
    await s.call<{ id: string }>(
      `/products/${s.product.id}/plan`,
      "POST",
      s.planInput,
    )
  ).data;
  const adapter = mockAdapter();
  const analyze = adapter.analyze;
  adapter.analyze = async (...args) => {
    const result = await analyze(...args);
    return {
      ...result,
      value: { ...result.value, suggestedTitle: "차콜 코튼 셔츠" },
    };
  };
  await runPlanStage(s.env, job.id, "analysis", {
    adapter: async () => adapter,
  });
  expect(
    (await s.call<ProductDto>(`/products/${s.product.id}`)).data.name,
  ).toBe("차콜 코튼 셔츠");
  expect(
    s.sqlite.query("SELECT count(*) n FROM generation_attempts").get(),
  ).toEqual({ n: 1 });
  await runPlanStage(s.env, job.id, "planning", {
    adapter: async () => adapter,
  });
  adapter.analyze = async (...args) => {
    await s.call(`/products/${s.product.id}`, "PATCH", {
      name: "내가 정한 제목",
    });
    return analyze(...args);
  };
  const next = (
    await s.call<{ id: string }>(`/products/${s.product.id}/plan`, "POST", {
      ...s.planInput,
      idempotencyKey: crypto.randomUUID(),
    })
  ).data;
  expect(next.id).toBeTruthy();
  await runPlanStage(s.env, next.id, "analysis", {
    adapter: async () => adapter,
  });
  expect(
    (await s.call<ProductDto>(`/products/${s.product.id}`)).data.name,
  ).toBe("내가 정한 제목");
});

test("planning pins person and composition images and uses current edited analysis in one planning-only call", async () => {
  const s = await studioFixture();
  const first = await s.startPlan();
  await runPlanStage(s.env, first.id, "analysis");
  await runPlanStage(s.env, first.id, "planning");
  await s.call(
    `/products/${s.product.id}/references`,
    "POST",
    referenceForm("person_reference"),
  );
  const p = (
    await s.call<ProductDto>(
      `/products/${s.product.id}/references`,
      "POST",
      referenceForm("look_reference"),
    )
  ).data;
  const person = p.assets.find((a) => a.kind === "person_reference"),
    look = p.assets.find((a) => a.kind === "look_reference");
  if (!person || !look || !p.analysis)
    throw new Error("Missing synthetic reference");
  const input = {
    ...s.planInput,
    idempotencyKey: crypto.randomUUID(),
    reuseAnalysis: true,
    editedAnalysis: { ...p.analysis, garmentType: "수정된 니트" },
    personReferenceId: person.id,
    lookReferenceId: look.id,
    referenceConsent: true,
  };
  expect(
    (
      await s.call(`/products/${p.id}/plan`, "POST", {
        ...input,
        referenceConsent: false,
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await s.call(`/products/${p.id}/plan`, "POST", {
        ...input,
        personReferenceId: look.id,
      })
    ).status,
  ).toBe(404);
  const second = (
    await s.call<{ id: string }>(`/products/${p.id}/plan`, "POST", input)
  ).data;
  let calls = 0;
  const adapter = mockAdapter(),
    plan = adapter.plan;
  adapter.plan = async (...args) => {
    calls++;
    expect(args[1].garmentType).toBe("수정된 니트");
    expect(args[4]?.personImage).toStartWith("data:image/png;base64,");
    expect(args[4]?.lookImage).toStartWith("data:image/png;base64,");
    return plan(...args);
  };
  await runPlanStage(s.env, second.id, "analysis", {
    adapter: async () => adapter,
  });
  await runPlanStage(s.env, second.id, "planning", {
    adapter: async () => adapter,
  });
  expect(calls).toBe(1);
  expect(
    s.sqlite
      .query("SELECT stage FROM generation_attempts WHERE job_id=?")
      .all(second.id),
  ).toEqual([{ stage: "planning" }]);
});
