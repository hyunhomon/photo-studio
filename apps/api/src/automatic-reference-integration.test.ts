import { expect, test } from "bun:test";
import { mockAdapter, ProviderError } from "@photo-studio/ai";
import type { JobDto, PipelineDto, ProductDto } from "@photo-studio/schemas";
import {
  planRequestSchema,
  generateRequestSchema,
} from "@photo-studio/schemas";
import { studioFixture } from "../test/studio";
import { referenceForm } from "../test/references";
import { runPlanStage } from "./pipeline";
import { runGenerationStage } from "./generation";
import { ensureAutomaticReference } from "./automatic-reference";

function snapshot(s: Awaited<ReturnType<typeof studioFixture>>, id: string) {
  return JSON.parse(
    (
      s.sqlite
        .query("SELECT request_json FROM generation_jobs WHERE id=?")
        .get(id) as { request_json: string }
    ).request_json,
  );
}

async function readyAutomatic() {
  const s = await studioFixture();
  const queued = await s.call<JobDto>(
    `/products/${s.product.id}/plan`,
    "POST",
    { ...s.planInput, useAutomaticReference: true },
  );
  expect(queued.status).toBe(202);
  const originalRequest = snapshot(s, queued.data.id);
  await runPlanStage(s.env, queued.data.id, "analysis");
  await runPlanStage(s.env, queued.data.id, "planning");
  const pipeline = (
    await s.call<PipelineDto>(`/products/${s.product.id}/pipeline`)
  ).data;
  const plan = pipeline.plans[0],
    retrieved = pipeline.retrievals?.[0];
  if (!plan || !retrieved?.assetId)
    throw new Error("Missing synthetic automatic reference");
  expect(retrieved.status).toBe("selected");
  expect(retrieved.provider).toBe("mock");
  expect(plan.lookReferenceId).toBe(retrieved.assetId);
  expect(plan.spec.camera.referenceComposition).toBe("inspire");
  expect(snapshot(s, queued.data.id)).toEqual(originalRequest);
  return { ...s, plan, retrieved, queued };
}

test("new execution defaults to automatic reference discovery without mutating immutable request snapshots", () => {
  const base = { consent: true, idempotencyKey: crypto.randomUUID() };
  expect(planRequestSchema.parse(base).useAutomaticReference).toBe(true);
  expect(
    generateRequestSchema.parse({
      ...base,
      planId: crypto.randomUUID(),
      quality: "medium",
      count: 1,
    }).useAutomaticReference,
  ).toBe(true);
});

test("analysis automatically retrieves a private reference and generation forwards its exact pixels without client selection", async () => {
  const s = await readyAutomatic();
  const asset = (
    await s.call<ProductDto>(`/products/${s.product.id}`)
  ).data.assets.find((a) => a.id === s.retrieved.assetId);
  expect(asset?.kind).toBe("auto_look_reference");
  expect(
    (
      await s.call(
        `/products/${s.product.id}/pipeline`,
        "GET",
        undefined,
        await s.login(),
      )
    ).status,
  ).toBe(404);
  const row = s.sqlite
    .query("SELECT r2_key FROM assets WHERE id=?")
    .get(s.retrieved.assetId) as { r2_key: string };
  const object = await s.env.ASSETS.get(row.r2_key);
  if (!object) throw new Error("Missing synthetic reference pixels");
  const expectedPixels = `data:image/png;base64,${Buffer.from(await object.arrayBuffer()).toString("base64")}`;
  const generation = await s.call<JobDto>(
    `/products/${s.product.id}/generate`,
    "POST",
    {
      consent: true,
      idempotencyKey: crypto.randomUUID(),
      planId: s.plan.id,
      quality: "medium",
      count: 1,
      editedPlan: {
        ...s.plan.spec,
        camera: {
          ...s.plan.spec.camera,
          angle: "Synthetic elevated viewpoint",
        },
      },
    },
  );
  expect(generation.status).toBe(202);
  const captured = snapshot(s, generation.data.id);
  expect(captured.lookReferenceId).toBe(s.retrieved.assetId);
  expect(captured.referenceConsent).toBe(true);
  expect(captured.referenceSources[0].discovery).toBe("mock_automatic");
  let calls = 0;
  const adapter = mockAdapter(),
    generate = adapter.generate;
  adapter.generate = async (...args) => {
    calls++;
    expect(args[4]?.lookImage).toBe(expectedPixels);
    expect(args[4]?.lookReferenceKind).toBe("automatic_environment");
    expect(args[2].camera.angle).toBe("Synthetic elevated viewpoint");
    expect(args[2].camera.referenceComposition).toBe("inspire");
    return generate(...args);
  };
  await runGenerationStage(s.env, generation.data.id, "generation", {
    adapter: async () => adapter,
  });
  expect(calls).toBe(1);
  expect(
    (await s.call<JobDto>(`/jobs/${generation.data.id}`)).data.status,
  ).toBe("needs_review");
  const exported = await s.app.request(
    "/api/v1/account/export",
    { headers: s.headers },
    s.env,
  );
  expect(exported.ok).toBe(true);
  const data = (await exported.json()) as {
    automaticReferences: { assetId: string | null }[];
  };
  expect(data.automaticReferences[0]?.assetId).toEqual(s.retrieved.assetId);
});

test("retrieval failure retains successful analysis and stops before the paid planner", async () => {
  const s = await studioFixture();
  const j = (
    await s.call<JobDto>(`/products/${s.product.id}/plan`, "POST", {
      ...s.planInput,
      useAutomaticReference: true,
    })
  ).data;
  await runPlanStage(s.env, j.id, "analysis");
  let plannerCalls = 0;
  const adapter = mockAdapter();
  adapter.plan = async () => {
    plannerCalls++;
    throw new Error("Synthetic planner must not run");
  };
  await runPlanStage(s.env, j.id, "planning", {
    adapter: async () => adapter,
    automaticReference: async () => {
      throw new ProviderError("AUTO_REFERENCE_NOT_FOUND");
    },
  });
  expect(plannerCalls).toBe(0);
  const job = (await s.call<JobDto>(`/jobs/${j.id}`)).data;
  expect(job.status).toBe("failed");
  expect(job.stage).toBe("reference_search");
  expect(job.errorCode).toBe("AUTO_REFERENCE_NOT_FOUND");
  expect(job.attempts.map((attempt) => attempt.stage)).toEqual(["analysis"]);
  expect(
    (await s.call<ProductDto>(`/products/${s.product.id}`)).data.analysis,
  ).toBeTruthy();
});

test("manual look references override discovery and explicit automatic opt-out is respected", async () => {
  const s = await studioFixture();
  const uploaded = await s.call<ProductDto>(
    `/products/${s.product.id}/references`,
    "POST",
    referenceForm("look_reference"),
  );
  const look = uploaded.data.assets.find(
    (asset) => asset.kind === "look_reference",
  );
  if (!look) throw new Error("Missing manual synthetic reference");
  const job = (
    await s.call<JobDto>(`/products/${s.product.id}/plan`, "POST", {
      ...s.planInput,
      useAutomaticReference: true,
      lookReferenceId: look.id,
      referenceConsent: true,
    })
  ).data;
  await runPlanStage(s.env, job.id, "analysis");
  let searches = 0;
  await runPlanStage(s.env, job.id, "planning", {
    automaticReference: async () => {
      searches++;
      throw new Error("Manual reference must win");
    },
  });
  expect(searches).toBe(0);
  const planned = (
    await s.call<PipelineDto>(`/products/${s.product.id}/pipeline`)
  ).data;
  expect(planned.plans[0]?.lookReferenceId).toBe(look.id);
  expect(planned.retrievals).toEqual([]);

  const automatic = await readyAutomatic();
  const noReference = await automatic.call<JobDto>(
    `/products/${automatic.product.id}/generate`,
    "POST",
    {
      consent: true,
      idempotencyKey: crypto.randomUUID(),
      planId: automatic.plan.id,
      quality: "medium",
      count: 1,
      useAutomaticReference: false,
    },
  );
  expect(noReference.status).toBe(202);
  expect(snapshot(automatic, noReference.data.id).lookReferenceId).toBeNull();
});

test("an automatic image from a different plan cannot be smuggled in as a manual look reference", async () => {
  const s = await readyAutomatic();
  const next = (
    await s.call<JobDto>(`/products/${s.product.id}/plan`, "POST", {
      ...s.planInput,
      useAutomaticReference: true,
      idempotencyKey: crypto.randomUUID(),
    })
  ).data;
  await runPlanStage(s.env, next.id, "analysis");
  await runPlanStage(s.env, next.id, "planning");
  const p = (await s.call<PipelineDto>(`/products/${s.product.id}/pipeline`))
    .data.plans[0];
  if (!p) throw new Error("Missing second automatic plan");
  expect(
    (
      await s.call(`/products/${s.product.id}/generate`, "POST", {
        consent: true,
        idempotencyKey: crypto.randomUUID(),
        planId: p.id,
        quality: "medium",
        count: 1,
        lookReferenceId: s.retrieved.assetId,
        referenceConsent: true,
      })
    ).status,
  ).toBe(404);
});

test("normalized garment and retrieved reference share the 12MB budget before planning is charged", async () => {
  const s = await studioFixture();
  s.sqlite
    .query("UPDATE assets SET size_bytes=? WHERE product_id=?")
    .run(7 * 1024 * 1024, s.product.id);
  const job = (
    await s.call<JobDto>(`/products/${s.product.id}/plan`, "POST", {
      ...s.planInput,
      useAutomaticReference: true,
    })
  ).data;
  await runPlanStage(s.env, job.id, "analysis");
  let calls = 0;
  const adapter = mockAdapter();
  adapter.plan = async () => {
    calls++;
    throw new Error("Oversized reference input must not call planner");
  };
  await runPlanStage(s.env, job.id, "planning", {
    adapter: async () => adapter,
    automaticReference: async (...args) => {
      const selected = await ensureAutomaticReference(...args);
      s.sqlite
        .query("UPDATE assets SET size_bytes=? WHERE id=?")
        .run(6 * 1024 * 1024, selected.assetId);
      return selected;
    },
  });
  expect(calls).toBe(0);
  const failed = (await s.call<JobDto>(`/jobs/${job.id}`)).data;
  expect(failed.errorCode).toBe("SOURCE_TOO_LARGE");
  expect(failed.attempts.map((attempt) => attempt.stage)).toEqual(["analysis"]);
});
