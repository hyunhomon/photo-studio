import { expect, test } from "bun:test";
import {
  captureProfiles,
  compilePhotographicPrompt,
  focusEnvelope,
  resolveCaptureProfile,
  retailFraming,
} from "./photography";
import { mockPlan, openRouterAdapter, ProviderError } from "./provider";
import { mockAnalysisFixture } from "./fixtures";

test("capture profiles retain a usable garment focus region and monotonically separate the background", () => {
  const blur: number[] = [];
  for (const separation of Object.keys(
    captureProfiles,
  ) as (keyof typeof captureProfiles)[]) {
    const plan = mockPlan(mockAnalysisFixture);
    plan.camera.backgroundSeparation = separation;
    const profile = resolveCaptureProfile(plan);
    const focus = focusEnvelope(profile),
      s = profile.subjectDistanceM * 1000,
      d = s + profile.backgroundDistanceM * 1000;
    expect(focus.nearM).toBeLessThan(profile.subjectDistanceM - 0.2);
    expect(focus.farM).toBeGreaterThan(profile.subjectDistanceM + 0.2);
    blur.push(
      ((profile.focalLengthMm ** 2 / profile.aperture) * (d - s)) /
        (d * (s - profile.focalLengthMm)),
    );
  }
  expect(blur[0]).toBeLessThan(blur[1] ?? 0);
  expect(blur[1]).toBeLessThan(blur[2] ?? 0);
});
test("legacy shot modes do not enter the image prompt; revisions and reference roles do", () => {
  const plan = mockPlan(mockAnalysisFixture);
  plan.shootType = "model_location";
  plan.model.appearance =
    "fictional adult with a relaxed individual expression";
  plan.materialDirection =
    "preserve matte cotton weave; distinguish rough stone";
  const prompt = compilePhotographicPrompt(plan, 3, {
    reason: "human_naturalness",
    adjustments: "Synthetic relaxed shoulders",
    previousImage: "data:image/png;base64,synthetic",
  });
  expect(prompt).not.toContain("model_location");
  expect(prompt).not.toContain("model_studio");
  expect(prompt).toContain("references 1..3");
  expect(prompt).toContain("Reference 4");
  expect(prompt).toContain("No wax");
  expect(prompt).toContain("contact shadows");
  expect(prompt).toContain("Depth blur should increase continuously");
  expect(prompt).toContain("Synthetic relaxed shoulders");
  expect(prompt).toContain(plan.model.appearance);
  expect(prompt).toContain(plan.materialDirection);
  expect(() =>
    compilePhotographicPrompt(plan, 1, { captureVersion: "unsupported" }),
  ).toThrow();
});
test("retail framing backs the camera up to show the garment while respecting explicitly approved close-ups", () => {
  const plan = mockPlan(mockAnalysisFixture);
  const garment = resolveCaptureProfile(plan);
  plan.camera.framing = "전신 · 소매와 밑단 디테일이 읽히는 구도";
  const body = resolveCaptureProfile(plan);
  plan.camera.framing = "embroidery close-up";
  const detail = resolveCaptureProfile(plan);
  expect(body.subjectDistanceM).toBeGreaterThan(garment.subjectDistanceM);
  expect(garment.subjectDistanceM).toBeGreaterThan(detail.subjectDistanceM);
  expect((32 * garment.subjectDistanceM) / garment.focalLengthMm).toBeCloseTo(
    1.65,
    1,
  );
  expect(retailFraming("3/4 portrait with garment visible").coverage).toBe(
    "full_garment",
  );
  expect(retailFraming("얼굴 클로즈업").coverage).toBe("approved_detail");
  const requested = compilePhotographicPrompt(plan, 1);
  expect(requested).toContain("user explicitly approved a close-up/detail");
  expect(requested).not.toContain("Avoid a chest-up beauty portrait");
});
test("retail revision releases prior retouching and crop; approved uncertain garment evidence is carried as data", () => {
  const prompt = compilePhotographicPrompt(mockPlan(mockAnalysisFixture), 1, {
    previousImage: "synthetic-prior",
    reason: "human_naturalness",
    garmentAnalysis: mockAnalysisFixture,
  });
  expect(prompt).toContain("fictional-adult identity cues ONLY");
  expect(prompt).toContain("Do not inherit its skin retouching");
  expect(prompt).toContain("hem and sleeve ends");
  expect(prompt).toContain("NEVER by shrinking the head");
  expect(prompt).toContain("original images take precedence");
  expect(prompt).toContain(JSON.stringify(mockAnalysisFixture));
  expect(prompt).toContain("without thickening, filling or simplifying");
});
test("one image request binds garment then continuity references and rejects insufficient reference capability before generation", async () => {
  let imageCalls = 0;
  const transport = Object.assign(
    async (input: unknown, init?: RequestInit) => {
      if (String(input).endsWith("/images/models"))
        return Response.json({
          data: [
            {
              id: "synthetic/photo",
              architecture: {
                input_modalities: ["image"],
                output_modalities: ["image"],
              },
              supported_parameters: {
                aspect_ratio: { values: ["3:4"] },
                output_format: { values: ["png"] },
                quality: { values: ["medium"] },
                n: { min: 1, max: 1 },
                input_references: { max: 3 },
              },
            },
          ],
        });
      imageCalls++;
      expect(String(input)).toEndWith("/images");
      const body = JSON.parse(String(init?.body));
      expect(body.n).toBe(1);
      expect(
        body.input_references.map(
          (r: { image_url: { url: string } }) => r.image_url.url,
        ),
      ).toEqual(["garment-reference", "continuity-reference"]);
      expect(body.prompt).toContain("CONTROLLED REVISION");
      expect(body.prompt).toContain("Synthetic side light");
      return Response.json({
        data: [{ b64_json: btoa("synthetic-bytes"), media_type: "image/png" }],
        usage: { cost: 0.01 },
      });
    },
    { preconnect: fetch.preconnect },
  ) as typeof fetch;
  const adapter = openRouterAdapter(
    "synthetic-key",
    "https://synthetic.invalid/capture",
    transport,
  );
  await expect(
    adapter.preflight("synthetic/photo", "generation", "medium", 4),
  ).rejects.toBeInstanceOf(ProviderError);
  expect(imageCalls).toBe(0);
  await adapter.preflight("synthetic/photo", "generation", "medium", 2);
  const image = await adapter.generate(
    "synthetic/photo",
    ["garment-reference"],
    mockPlan(mockAnalysisFixture),
    "medium",
    {
      reason: "lighting_focus",
      adjustments: "Synthetic side light",
      previousImage: "continuity-reference",
    },
  );
  expect(imageCalls).toBe(1);
  expect(image.usage.actualCostUsd).toBe(0.01);
});
