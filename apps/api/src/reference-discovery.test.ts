import { expect, test } from "bun:test";
import { studioFixture } from "../test/studio";
import { referenceForm } from "../test/references";
import { canonicalPinUrl } from "./reference-source";
import { runPlanStage } from "./pipeline";
import { runGenerationStage } from "./generation";
import { mockAdapter } from "@photo-studio/ai";
import type { JobDto, ProductDto } from "@photo-studio/schemas";
import { pinterestSearchUrl } from "../../web/src/lib/reference-discovery";

test("Pinterest discovery only uses curated words and canonical user-entered pin URLs, never arbitrary fetch targets", () => {
  const source = "https://kr.pinterest.com/pin/123456789/?utm_source=synthetic";
  expect(canonicalPinUrl(source)).toBe(
    "https://www.pinterest.com/pin/123456789/",
  );
  for (const url of [
    "http://www.pinterest.com/pin/123456789/",
    "https://pinterest.com.evil.invalid/pin/123456789/",
    "https://user:password@pinterest.com/pin/123456789/",
    "https://pin.it/synthetic",
    "https://localhost/private",
    "javascript:alert(1)",
    "https://www.pinterest.com/search/pins/",
  ])
    expect(() => canonicalPinUrl(url)).toThrow();
  const search = new URL(
    pinterestSearchUrl(
      "Private account secret-custom-design",
      "private-not-a-style",
    ),
  );
  expect(search.origin).toBe("https://www.pinterest.com");
  expect(search.searchParams.get("q")).toBe(
    "clothing fashion lookbook studio photography natural fabric shadows",
  );
  expect(pinterestSearchUrl("후드 집업", "daylight")).toContain("hoodie+");
});

test("user-uploaded look provenance is private, starts no AI and survives in server-derived plan/generation snapshots", async () => {
  const s = await studioFixture(),
    path = `/products/${s.product.id}/references`;
  const form = referenceForm("look_reference");
  form.set(
    "sourcePinUrl",
    "https://www.pinterest.com/pin/123456789/?tracking=ignored",
  );
  const saved = await s.call<ProductDto>(path, "POST", form);
  expect(saved.status).toBe(201);
  const look = saved.data.assets.find(
    (asset) => asset.kind === "look_reference",
  );
  expect(look?.sourcePinUrl).toBe("https://www.pinterest.com/pin/123456789/");
  expect(s.workflows).toHaveLength(0);
  expect(
    (
      await s.call(
        `/products/${s.product.id}`,
        "GET",
        undefined,
        await s.login(),
      )
    ).status,
  ).toBe(404);
  const job = (
    await s.call<JobDto>(`/products/${s.product.id}/plan`, "POST", {
      ...s.planInput,
      lookReferenceId: look?.id,
      referenceConsent: true,
    })
  ).data;
  const snapshot = (id: string) =>
    JSON.parse(
      (
        s.sqlite
          .query("SELECT request_json FROM generation_jobs WHERE id=?")
          .get(id) as { request_json: string }
      ).request_json,
    );
  expect(snapshot(job.id).referenceSources).toEqual([
    {
      assetId: look?.id,
      role: "look_reference",
      discovery: "pinterest_manual",
      sourceUrl: look?.sourcePinUrl,
    },
  ]);
  const adapter = mockAdapter();
  const originalPlan = adapter.plan,
    originalGenerate = adapter.generate;
  let planningCalls = 0,
    generationCalls = 0;
  adapter.plan = async (...args) => {
    planningCalls++;
    expect(JSON.stringify(args)).not.toContain("pinterest.com");
    expect(args[4]?.lookImage).toStartWith("data:image/png;base64,");
    return originalPlan(...args);
  };
  adapter.generate = async (...args) => {
    generationCalls++;
    expect(JSON.stringify(args)).not.toContain("pinterest.com");
    expect(args[4]?.lookImage).toStartWith("data:image/png;base64,");
    return originalGenerate(...args);
  };
  const deps = { adapter: async () => adapter };
  await runPlanStage(s.env, job.id, "analysis", deps);
  await runPlanStage(s.env, job.id, "planning", deps);
  const generated = await s.call<JobDto>(
    `/products/${s.product.id}/generate`,
    "POST",
    {
      consent: true,
      idempotencyKey: crypto.randomUUID(),
      planId: job.id,
      quality: "medium",
      count: 1,
      regenerationOf: null,
      regenerationReason: null,
      lookReferenceId: look?.id,
      referenceConsent: true,
    },
  );
  expect(generated.status).toBe(202);
  expect(snapshot(generated.data.id).referenceSources).toEqual(
    snapshot(job.id).referenceSources,
  );
  await runGenerationStage(s.env, generated.data.id, "generation", deps);
  expect(planningCalls).toBe(1);
  expect(generationCalls).toBe(1);
});

test("provenance cannot bypass reference role or upload rights validation", async () => {
  const s = await studioFixture(),
    path = `/products/${s.product.id}/references`;
  for (const form of [
    referenceForm("person_reference"),
    referenceForm("look_reference", false),
  ]) {
    form.set("sourcePinUrl", "https://www.pinterest.com/pin/123456789/");
    expect((await s.call(path, "POST", form)).status).toBe(400);
  }
  expect(s.objects.size).toBe(1);
  expect(s.workflows).toHaveLength(0);
});
