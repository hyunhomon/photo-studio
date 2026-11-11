import { expect, test, spyOn } from "bun:test";
import type { PipelineDto, JobDto, UsageDto } from "@photo-studio/schemas";
import { studioFixture } from "../test/studio";
import { runPlanStage } from "./pipeline";
import { runGenerationStage } from "./generation";
import { cleanupStorage } from "./storage";
import type { ProjectDto, ProductDto } from "@photo-studio/schemas";
test("owner-only usage distinguishes unknown costs; safe export excludes credentials; account deletion cascades", async () => {
  const s = await studioFixture(),
    planJob = await s.startPlan();
  await runPlanStage(s.env, planJob.id, "analysis");
  await runPlanStage(s.env, planJob.id, "planning");
  const plan = (await s.call<PipelineDto>(`/products/${s.product.id}/pipeline`))
    .data.plans[0];
  if (!plan) throw new Error("Missing fixture plan");
  await s.call(`/plans/${plan.id}`, "PATCH", {
    spec: plan.spec,
    approved: true,
  });
  const job = (
    await s.call<JobDto>(`/products/${s.product.id}/generate`, "POST", {
      consent: true,
      idempotencyKey: crypto.randomUUID(),
      planId: plan.id,
      quality: "medium",
      count: 1,
    })
  ).data;
  await runGenerationStage(s.env, job.id, "generation");
  await runGenerationStage(s.env, job.id, "evaluation");
  await s.call(`/assets/${job.id}/feedback`, "POST", { decision: "accepted" });
  s.sqlite.run(
    "UPDATE generation_attempts SET actual_cost_usd=0.01 WHERE stage='generation'",
  );
  const usage = (await s.call<UsageDto>("/usage")).data;
  expect([
    usage.calls,
    usage.knownCostCount,
    usage.unknownCostCount,
    usage.reportedCostUsd,
  ]).toEqual([4, 1, 3, 0.01]);
  expect(usage.reviewedAcceptanceRate).toBe(1);
  expect(usage.evaluatedAcceptanceRate).toBe(1);
  expect(usage.acceptedCostUsd).toBe(0.01);
  const b = await s.login();
  expect(
    (await s.call<UsageDto>("/usage", "GET", undefined, b)).data.calls,
  ).toBe(0);
  const exported = await s.app.request(
    "/api/v1/account/export",
    { headers: s.headers },
    s.env,
  );
  expect(exported.status).toBe(200);
  const text = await exported.text();
  for (const value of [
    "keyEnvelope",
    "key_envelope",
    "tokenHash",
    "csrf",
    "synthetic-mock-credential",
    s.env.APP_ENCRYPTION_KEY_B64 ?? "missing",
  ])
    expect(text.includes(value)).toBe(false);
  expect(
    (await s.call("/account", "DELETE", { confirm: "wrong" })).status,
  ).toBe(400);
  expect(
    (await s.call("/account", "DELETE", { confirm: "DELETE" })).status,
  ).toBe(200);
  expect(s.objects.size).toBe(0);
  const purge = s.sqlite.query("SELECT user_id FROM media_purges").get() as {
    user_id: string;
  } | null;
  if (!purge) throw new Error("Missing media purge tombstone");
  s.objects.set(`${purge.user_id}/synthetic-late.png`, {
    bytes: new Uint8Array([1]),
    type: "image/png",
  });
  await cleanupStorage(s.env);
  expect(s.objects.size).toBe(0);
  expect((await s.call("/me")).status).toBe(401);
  expect((await s.call("/me", "GET", undefined, b)).status).toBe(200);
});
test("failed account cleanup blocks new work, preserves retry session and finishes on retry", async () => {
  const s = await studioFixture();
  const failure = spyOn(s.env.ASSETS, "delete").mockRejectedValue(
    new Error("Synthetic failure"),
  );
  expect(
    (await s.call("/account", "DELETE", { confirm: "DELETE" })).status,
  ).toBe(503);
  expect((await s.call<{ deleting: boolean }>("/me")).data.deleting).toBe(true);
  expect(
    (await s.call("/projects", "POST", { name: "Must be blocked" })).status,
  ).toBe(409);
  failure.mockRestore();
  expect(
    (await s.call("/account", "DELETE", { confirm: "DELETE" })).status,
  ).toBe(200);
  expect(s.objects.size).toBe(0);
  expect(s.sqlite.query("SELECT count(*) n FROM users").get()).toEqual({
    n: 0,
  });
});
test("a project with 61 products reads and deletes all private media through batched data access", async () => {
  const s = await studioFixture(),
    owner = s.sqlite.query("SELECT user_id FROM projects").get() as {
      user_id: string;
    };
  const image = [...s.objects.values()][0];
  if (!image) throw new Error("Missing synthetic media");
  for (let i = 0; i < 60; i++) {
    const id = crypto.randomUUID(),
      assetId = crypto.randomUUID(),
      key = `${owner.user_id}/${id}/${assetId}.png`;
    s.sqlite.run(
      "INSERT INTO products(id,user_id,project_id,name,status,created_at) VALUES(?,?,?,'synthetic','ready',0)",
      [id, owner.user_id, s.project.id],
    );
    s.sqlite.run(
      "INSERT INTO assets(id,user_id,product_id,kind,r2_key,mime_type,size_bytes,width,height,created_at) VALUES(?,?,?,'input',?,'image/png',1,1,1,0)",
      [assetId, owner.user_id, id, key],
    );
    s.objects.set(key, image);
  }
  const project = await s.call<ProjectDto & { products: ProductDto[] }>(
    `/projects/${s.project.id}`,
  );
  expect(project.status).toBe(200);
  expect(project.data.products.length).toBe(61);
  expect((await s.call(`/projects/${s.project.id}`, "DELETE")).status).toBe(
    200,
  );
  expect(s.objects.size).toBe(0);
});
test("scheduled cleanup finishes a failed account deletion after its session has expired", async () => {
  const s = await studioFixture(),
    failure = spyOn(s.env.ASSETS, "delete").mockRejectedValue(
      new Error("Synthetic R2 outage"),
    );
  expect(
    (await s.call("/account", "DELETE", { confirm: "DELETE" })).status,
  ).toBe(503);
  failure.mockRestore();
  s.sqlite.exec("UPDATE sessions SET expires_at=0");
  expect((await s.call("/me")).status).toBe(401);
  await cleanupStorage(s.env);
  expect(s.objects.size).toBe(0);
  expect(s.sqlite.query("SELECT count(*) n FROM users").get()).toEqual({
    n: 0,
  });
  expect(
    s.sqlite.query("SELECT count(*) n FROM provider_connections").get(),
  ).toEqual({ n: 0 });
});
