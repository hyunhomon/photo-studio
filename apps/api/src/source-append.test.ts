import { expect, test } from "bun:test";
import { studioFixture } from "../test/studio";
import { syntheticPng } from "../test/png";
import { runPlanStage } from "./pipeline";
import { runGenerationStage } from "./generation";
import type { ProductDto, JobDto } from "@photo-studio/schemas";

function photo() {
  const form = new FormData();
  form.append(
    "images",
    new File([new Uint8Array(syntheticPng()).buffer], "synthetic-extra.png", {
      type: "image/png",
    }),
  );
  return form;
}
test("append originals after planning preserves old snapshots, calls no AI and is used by explicit reanalysis", async () => {
  const s = await studioFixture();
  const j = await s.startPlan();
  await runPlanStage(s.env, j.id, "analysis");
  await runPlanStage(s.env, j.id, "planning");
  const before = s.sqlite
    .query("SELECT source_ids_json FROM shoot_plans")
    .all();
  const jobs = s.sqlite.query("SELECT count(*) n FROM generation_jobs").get();
  const other = await s.login();
  expect(
    (await s.call(`/products/${s.product.id}/assets`, "POST", photo(), other))
      .status,
  ).toBe(404);
  const added = await s.call<ProductDto>(
    `/products/${s.product.id}/assets`,
    "POST",
    photo(),
  );
  expect(added.status).toBe(201);
  expect(added.data.assets.filter((a) => a.kind === "input")).toHaveLength(2);
  expect(added.data.analysis).toBeTruthy();
  expect(
    s.sqlite.query("SELECT source_ids_json FROM shoot_plans").all(),
  ).toEqual(before);
  expect(
    s.sqlite.query("SELECT count(*) n FROM generation_jobs").get(),
  ).toEqual(jobs);
  const plan = s.sqlite.query("SELECT id FROM shoot_plans").get() as {
    id: string;
  };
  const generated = await s.call<JobDto>(
    `/products/${s.product.id}/generate`,
    "POST",
    {
      consent: true,
      idempotencyKey: crypto.randomUUID(),
      planId: plan.id,
      quality: "medium",
      count: 1,
      regenerationOf: null,
      regenerationReason: null,
    },
  );
  expect(generated.status).toBe(202);
  const generationSnapshot = s.sqlite
    .query("SELECT request_json FROM generation_jobs WHERE id=?")
    .get(generated.data.id) as { request_json: string };
  expect(JSON.parse(generationSnapshot.request_json).sourceIds).toEqual([
    s.product.assets[0]?.id,
  ]);
  await runGenerationStage(s.env, generated.data.id, "generation");
  expect(
    s.sqlite
      .query("SELECT status FROM generation_jobs WHERE id=?")
      .get(generated.data.id),
  ).toEqual({ status: "needs_review" });
  const next = await s.call<JobDto>(`/products/${s.product.id}/plan`, "POST", {
    ...s.planInput,
    idempotencyKey: crypto.randomUUID(),
  });
  expect(next.status).toBe(202);
  const snapshot = s.sqlite
    .query("SELECT request_json FROM generation_jobs WHERE id=?")
    .get(next.data.id) as { request_json: string };
  expect(JSON.parse(snapshot.request_json).sourceIds).toHaveLength(2);
  expect(
    (await s.call(`/products/${s.product.id}/assets`, "POST", photo())).status,
  ).toBe(409);
});

test("append retains three-original cap and restores ready status after validation failure", async () => {
  const s = await studioFixture();
  for (let i = 0; i < 2; i++)
    expect(
      (await s.call(`/products/${s.product.id}/assets`, "POST", photo()))
        .status,
    ).toBe(201);
  expect(
    (await s.call(`/products/${s.product.id}/assets`, "POST", photo())).status,
  ).toBe(409);
  expect(
    (await s.call<ProductDto>(`/products/${s.product.id}`)).data.status,
  ).toBe("ready");
  expect(
    (await s.call<ProductDto>(`/products/${s.product.id}`)).data.assets,
  ).toHaveLength(3);
});

test("invalid appended photo releases the product lock without losing originals", async () => {
  const s = await studioFixture();
  const form = new FormData();
  form.append(
    "images",
    new File(["invalid-image"], "synthetic-invalid.png", { type: "image/png" }),
  );
  expect(
    (await s.call(`/products/${s.product.id}/assets`, "POST", form)).status,
  ).toBe(400);
  const product = (await s.call<ProductDto>(`/products/${s.product.id}`)).data;
  expect(product.status).toBe("ready");
  expect(product.assets).toHaveLength(1);
  expect(
    (await s.call(`/products/${s.product.id}/assets`, "POST", photo())).status,
  ).toBe(201);
});
