import { expect, test } from "bun:test";
import { mockAdapter } from "@photo-studio/ai";
import type { JobDto, PipelineDto, ProductDto } from "@photo-studio/schemas";
import { studioFixture } from "../test/studio";
import { referenceForm } from "../test/references";
import { syntheticPng } from "../test/png";
import { runPlanStage } from "./pipeline";
import { runGenerationStage, type GenerationSnapshot } from "./generation";

async function readyWithLook() {
  const s = await studioFixture();
  const path = `/products/${s.product.id}/references`;
  const uploaded = await s.call<ProductDto>(
    path,
    "POST",
    referenceForm("look_reference"),
  );
  const look = uploaded.data.assets.find((a) => a.kind === "look_reference");
  if (!look) throw new Error("Missing synthetic look");
  const queued = await s.call<JobDto>(
    `/products/${s.product.id}/plan`,
    "POST",
    {
      ...s.planInput,
      lookReferenceId: look.id,
      referenceConsent: true,
    },
  );
  await runPlanStage(s.env, queued.data.id, "analysis");
  const adapter = mockAdapter();
  const originalPlan = adapter.plan;
  adapter.plan = async (...args) => {
    const planned = await originalPlan(...args);
    planned.value.referenceNotes =
      "Synthetic old image: hard light from camera left";
    return planned;
  };
  await runPlanStage(s.env, queued.data.id, "planning", {
    adapter: async () => adapter,
  });
  const plan = (await s.call<PipelineDto>(`/products/${s.product.id}/pipeline`))
    .data.plans[0];
  if (!plan) throw new Error("Missing synthetic plan");
  expect(plan.lookReferenceId).toBe(look.id);
  return { ...s, path, look, plan };
}

function snapshot(s: Awaited<ReturnType<typeof readyWithLook>>, jobId: string) {
  const row = s.sqlite
    .query("SELECT request_json FROM generation_jobs WHERE id=?")
    .get(jobId) as { request_json: string };
  return JSON.parse(row.request_json) as GenerationSnapshot;
}

function persistedNotes(s: Awaited<ReturnType<typeof readyWithLook>>) {
  const row = s.sqlite
    .query("SELECT spec_json FROM shoot_plans WHERE id=?")
    .get(s.plan.id) as { spec_json: string };
  return (JSON.parse(row.spec_json) as { referenceNotes: string })
    .referenceNotes;
}

test("replacing a planned look clears its old observation notes while the new pixels and manual camera edits reach generation", async () => {
  const s = await readyWithLook();
  expect((await s.call(`/assets/${s.look.id}`, "DELETE")).status).toBe(200);
  const uploaded = await s.call<ProductDto>(
    s.path,
    "POST",
    referenceForm("look_reference", true, syntheticPng(48, 72)),
  );
  expect(uploaded.status).toBe(201);
  const look = uploaded.data.assets.find((a) => a.kind === "look_reference");
  if (!look) throw new Error("Missing replacement synthetic look");
  const media = await s.app.request(
    `/api/v1/assets/${look.id}/content`,
    { headers: s.headers },
    s.env,
  );
  expect(media.status).toBe(200);
  const expectedPixels = `data:image/png;base64,${btoa(String.fromCharCode(...new Uint8Array(await media.arrayBuffer())))}`;
  const generated = await s.call<JobDto>(
    `/products/${s.product.id}/generate`,
    "POST",
    {
      consent: true,
      referenceConsent: true,
      idempotencyKey: crypto.randomUUID(),
      planId: s.plan.id,
      quality: "medium",
      count: 1,
      lookReferenceId: look.id,
      editedPlan: {
        ...s.plan.spec,
        camera: { ...s.plan.spec.camera, angle: "Synthetic edited high angle" },
      },
    },
  );
  expect(generated.status).toBe(202);
  const saved = snapshot(s, generated.data.id);
  expect(saved.lookReferenceId).toBe(look.id);
  expect(saved.plan.referenceNotes).toBe("");
  expect(saved.plan.camera.angle).toBe("Synthetic edited high angle");
  expect(persistedNotes(s)).toBe(s.plan.spec.referenceNotes);
  let calls = 0;
  const adapter = mockAdapter();
  const originalGenerate = adapter.generate;
  adapter.generate = async (...args) => {
    calls++;
    expect(args[2].referenceNotes).toBe("");
    expect(args[2].camera.angle).toBe("Synthetic edited high angle");
    expect(args[4]?.lookImage).toBe(expectedPixels);
    return originalGenerate(...args);
  };
  await runGenerationStage(s.env, generated.data.id, "generation", {
    adapter: async () => adapter,
  });
  expect(calls).toBe(1);
  expect((await s.call<JobDto>(`/jobs/${generated.data.id}`)).data.status).toBe(
    "needs_review",
  );
});

test("planning observations survive only when the same look image is selected for generation", async () => {
  for (const selected of [true, false]) {
    const s = await readyWithLook();
    const generated = await s.call<JobDto>(
      `/products/${s.product.id}/generate`,
      "POST",
      {
        consent: true,
        referenceConsent: selected,
        idempotencyKey: crypto.randomUUID(),
        planId: s.plan.id,
        quality: "medium",
        count: 1,
        lookReferenceId: selected ? s.look.id : null,
      },
    );
    expect(generated.status).toBe(202);
    expect(snapshot(s, generated.data.id).plan.referenceNotes).toBe(
      selected ? s.plan.spec.referenceNotes : "",
    );
    expect(persistedNotes(s)).toBe(s.plan.spec.referenceNotes);
  }
});
