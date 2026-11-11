import { expect, test, spyOn } from "bun:test";
import { mockAdapter, CAPTURE_PROTOCOL_VERSION } from "@photo-studio/ai";
import type { PipelineDto, ResultDto, JobDto } from "@photo-studio/schemas";
import { studioFixture } from "../test/studio";
import { runPlanStage } from "./pipeline";
import { runGenerationStage } from "./generation";
import { referenceForm } from "../test/references";
import type { ProductDto } from "@photo-studio/schemas";
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
test("generation consent, nullable costs, retired feedback and directed regeneration lineage", async () => {
  const s = await ready();
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
  expect(result).not.toHaveProperty("quality");
  expect(result).not.toHaveProperty("feedback");
  expect(result.captureVersion).toBe(CAPTURE_PROTOCOL_VERSION);
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
        decision: "accepted",
      })
    ).status,
  ).toBe(410);
  const regenerated = (
    await s.call<JobDto>(`/products/${s.product.id}/generate`, "POST", {
      ...s.input,
      idempotencyKey: crypto.randomUUID(),
      regenerationOf: result.asset.id,
      regenerationReason: "lighting_focus",
      adjustments: "Synthetic shadow direction adjustment",
    })
  ).data;
  let directions = 0;
  adapter.generate = async (...args) => {
    directions++;
    expect(args[4]?.reason).toBe("lighting_focus");
    expect(args[4]?.adjustments).toBe("Synthetic shadow direction adjustment");
    expect(args[4]?.previousImage?.startsWith("data:image/png;base64,")).toBe(
      true,
    );
    expect(args[4]?.garmentAnalysis?.garmentType).toBeTruthy();
    return original(...args);
  };
  await runGenerationStage(s.env, regenerated.id, "generation", deps);
  expect(directions).toBe(1);
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
  await s.call(`/products/${s.product.id}`, "DELETE");
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
test("selected person and look references are owner-scoped, consented, pinned and passed separately from garment evidence", async () => {
  const s = await ready();
  await s.approve();
  const uploaded = await s.call<ProductDto>(
    `/products/${s.product.id}/references`,
    "POST",
    referenceForm(),
  );
  const person = uploaded.data.assets.find(
    (a) => a.kind === "person_reference",
  );
  const lookUpload = await s.call<ProductDto>(
    `/products/${s.product.id}/references`,
    "POST",
    referenceForm("look_reference"),
  );
  const look = lookUpload.data.assets.find((a) => a.kind === "look_reference");
  if (!person || !look) throw Error("Missing synthetic reference");
  const body = {
    ...s.input,
    personReferenceId: person.id,
    lookReferenceId: look.id,
    referenceConsent: true,
  };
  expect(
    (
      await s.call(`/products/${s.product.id}/generate`, "POST", {
        ...body,
        referenceConsent: false,
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await s.call(`/products/${s.product.id}/generate`, "POST", {
        ...body,
        personReferenceId: look.id,
      })
    ).status,
  ).toBe(404);
  const job = (
    await s.call<JobDto>(`/products/${s.product.id}/generate`, "POST", body)
  ).data;
  expect((await s.call(`/assets/${person.id}`, "DELETE")).status).toBe(409);
  expect(
    (
      await s.call(
        `/products/${s.product.id}/references`,
        "POST",
        referenceForm(),
      )
    ).status,
  ).toBe(409);
  const adapter = mockAdapter(),
    original = adapter.generate;
  let calls = 0;
  adapter.preflight = async (_model, stage, _quality, count) => {
    expect(stage).toBe("generation");
    expect(count).toBe(3);
  };
  adapter.generate = async (...args) => {
    calls++;
    expect(args[1]).toHaveLength(1);
    expect(args[4]?.personImage).toStartWith("data:image/png;base64,");
    expect(args[4]?.lookImage).toStartWith("data:image/png;base64,");
    expect(args[4]?.previousImage).toBeUndefined();
    return original(...args);
  };
  await runGenerationStage(s.env, job.id, "generation", {
    adapter: async () => adapter,
  });
  expect(calls).toBe(1);
  const result = (
    await s.call<ResultDto[]>(`/products/${s.product.id}/results`)
  ).data[0];
  expect(result?.personReferenceUsed).toBe(true);
  expect(result?.lookReferenceUsed).toBe(true);
  expect((await s.call(`/assets/${person.id}`, "DELETE")).status).toBe(200);
  expect(
    (
      await s.call(`/products/${s.product.id}/generate`, "POST", {
        ...body,
        idempotencyKey: crypto.randomUUID(),
      })
    ).status,
  ).toBe(404);
});
test("a reference snapshot without processing consent fails before provider resolution or any paid claim", async () => {
  const s = await ready();
  await s.approve();
  const uploaded = await s.call<ProductDto>(
    `/products/${s.product.id}/references`,
    "POST",
    referenceForm(),
  );
  const ref = uploaded.data.assets.find((a) => a.kind === "person_reference");
  if (!ref) throw Error("Missing reference");
  const job = (
    await s.call<JobDto>(`/products/${s.product.id}/generate`, "POST", {
      ...s.input,
      personReferenceId: ref.id,
      referenceConsent: true,
    })
  ).data;
  s.sqlite.run(
    "UPDATE generation_jobs SET request_json=json_set(request_json,'$.referenceConsent',json('false')) WHERE id=?",
    [job.id],
  );
  let calls = 0;
  await runGenerationStage(s.env, job.id, "generation", {
    adapter: async () => {
      calls++;
      return mockAdapter();
    },
  });
  expect(calls).toBe(0);
  expect(
    s.sqlite
      .query("SELECT count(*) n FROM generation_attempts WHERE job_id=?")
      .get(job.id),
  ).toEqual({ n: 0 });
  expect((await s.call<JobDto>(`/jobs/${job.id}`)).data.errorCode).toBe(
    "REFERENCE_CONSENT_REQUIRED",
  );
});
test("retired evaluation stages never invoke an adapter or create a paid evaluation", async () => {
  const s = await ready();
  await s.approve();
  const job = (await s.generate()).data;
  await runGenerationStage(s.env, job.id, "generation");
  let calls = 0;
  const deps = {
    adapter: async () => {
      calls++;
      throw new Error("Evaluation must not resolve a provider");
    },
  };
  await runGenerationStage(s.env, job.id, "evaluation", deps);
  await runGenerationStage(s.env, job.id, "evaluation", deps);
  expect(calls).toBe(0);
  expect(
    s.sqlite
      .query(
        "SELECT count(*) n FROM generation_attempts WHERE stage='evaluation'",
      )
      .get(),
  ).toEqual({ n: 0 });
  expect(
    s.sqlite
      .query("SELECT status FROM generation_jobs WHERE kind='generate'")
      .get(),
  ).toEqual({ status: "needs_review" });
});

test("combined garment and previous reference size is checked before a paid claim", async () => {
  const s = await ready();
  await s.approve();
  const first = (await s.generate()).data;
  await runGenerationStage(s.env, first.id, "generation");
  s.sqlite.run("UPDATE assets SET size_bytes=? WHERE id=?", [
    12 * 1024 * 1024,
    first.id,
  ]);
  const next = (
    await s.call<JobDto>(`/products/${s.product.id}/generate`, "POST", {
      ...s.input,
      idempotencyKey: crypto.randomUUID(),
      regenerationOf: first.id,
      regenerationReason: "material_rendering",
    })
  ).data;
  let paid = 0;
  const adapter = mockAdapter();
  adapter.generate = async () => {
    paid++;
    throw new Error("Must not call");
  };
  await runGenerationStage(s.env, next.id, "generation", {
    adapter: async () => adapter,
  });
  expect(paid).toBe(0);
  expect(
    s.sqlite
      .query("SELECT count(*) n FROM generation_attempts WHERE job_id=?")
      .get(next.id),
  ).toEqual({ n: 0 });
  expect(
    s.sqlite
      .query("SELECT error_code FROM generation_jobs WHERE id=?")
      .get(next.id),
  ).toEqual({ error_code: "SOURCE_TOO_LARGE" });
});
test("deletion during a generation response prevents late image resurrection", async () => {
  const s = await ready();
  await s.approve();
  const job = (await s.generate()).data;
  const adapter = mockAdapter(),
    original = adapter.generate;
  adapter.generate = async (...args) => {
    const result = await original(...args);
    await s.call(`/products/${s.product.id}`, "DELETE");
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

test("generate atomically accepts draft edits and snapshots them without a separate approval; rejection and replay never overwrite edits", async () => {
  const s = await ready();
  expect(s.plan.status).toBe("draft");
  const original = (await s.call<ProductDto>(`/products/${s.product.id}`)).data
    .analysis;
  if (!original) throw new Error("Missing analysis");
  const editedAnalysis = {
    ...original,
    garmentType: "편집한 셔츠",
    preservationPoints: ["고유한 포켓 경계"],
  };
  const editedPlan = {
    ...s.plan.spec,
    camera: { ...s.plan.spec.camera, framing: "소매와 밑단을 포함한 프레임" },
  };
  const input = { ...s.input, editedAnalysis, editedPlan };
  expect(
    (
      await s.call(`/products/${s.product.id}/generate`, "POST", {
        ...input,
        consent: false,
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await s.call(`/products/${s.product.id}/generate`, "POST", {
        ...input,
        editedPlan: { ...editedPlan, mustPreserve: [] },
      })
    ).status,
  ).toBe(400);
  const stranger = await s.login();
  expect(
    (
      await s.call(
        `/products/${s.product.id}/generate`,
        "POST",
        input,
        stranger,
      )
    ).status,
  ).toBe(404);
  expect(
    (await s.call<ProductDto>(`/products/${s.product.id}`)).data.analysis,
  ).toEqual(original);
  const job = await s.call<JobDto>(
    `/products/${s.product.id}/generate`,
    "POST",
    input,
  );
  expect(job.status).toBe(202);
  expect(
    (await s.call<ProductDto>(`/products/${s.product.id}`)).data.analysis,
  ).toEqual(editedAnalysis);
  const saved = (
    await s.call<PipelineDto>(`/products/${s.product.id}/pipeline`)
  ).data.plans[0];
  expect(saved?.spec.camera.framing).toBe(editedPlan.camera.framing);
  expect(saved?.spec.mustPreserve).toContain("고유한 포켓 경계");
  s.sqlite
    .query("UPDATE products SET analysis_json=? WHERE id=?")
    .run(
      JSON.stringify({ ...editedAnalysis, garmentType: "후속 편집" }),
      s.product.id,
    );
  expect(
    (await s.call<JobDto>(`/products/${s.product.id}/generate`, "POST", input))
      .data.id,
  ).toBe(job.data.id);
  expect(
    (await s.call<ProductDto>(`/products/${s.product.id}`)).data.analysis
      ?.garmentType,
  ).toBe("후속 편집");
  const adapter = mockAdapter(),
    generate = adapter.generate;
  adapter.generate = async (...args) => {
    expect(args[2].camera.framing).toBe(editedPlan.camera.framing);
    return generate(...args);
  };
  await runGenerationStage(s.env, job.data.id, "generation", {
    adapter: async () => adapter,
  });
  expect(
    (await s.call<JobDto>(`/jobs/${job.data.id}`)).data.attempts,
  ).toHaveLength(1);
});

test("failure while saving generation settings rolls back the job and analysis together", async () => {
  const s = await ready();
  const original = (await s.call<ProductDto>(`/products/${s.product.id}`)).data
    .analysis;
  if (!original) throw new Error("Missing analysis");
  s.sqlite.run(
    "CREATE TRIGGER synthetic_save_failure BEFORE UPDATE ON shoot_plans BEGIN SELECT RAISE(ABORT, 'synthetic save failure'); END",
  );
  const response = await s.call(`/products/${s.product.id}/generate`, "POST", {
    ...s.input,
    editedAnalysis: { ...original, garmentType: "저장 실패할 수정" },
    editedPlan: s.plan.spec,
  });
  expect(response.status).toBe(500);
  expect(
    (await s.call<ProductDto>(`/products/${s.product.id}`)).data.analysis,
  ).toEqual(original);
  expect(
    s.sqlite
      .query("SELECT count(*) n FROM generation_jobs WHERE kind='generate'")
      .get(),
  ).toEqual({ n: 0 });
  expect(s.workflows).toHaveLength(1);
});
