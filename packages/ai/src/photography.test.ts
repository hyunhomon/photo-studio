import { expect, test } from "bun:test";
import {
  CAPTURE_PROTOCOL_VERSION,
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
  expect(requested).toContain(
    "execute the selected bust/waist-up/detail crop exactly",
  );
  expect(requested).not.toContain("Avoid a chest-up beauty portrait");
});
test("retail revision releases prior retouching and crop; approved uncertain garment evidence is carried as data", () => {
  const prompt = compilePhotographicPrompt(mockPlan(mockAnalysisFixture), 1, {
    previousImage: "synthetic-prior",
    reason: "human_naturalness",
    garmentAnalysis: mockAnalysisFixture,
  });
  expect(prompt).toContain("continuity of the adult, pose, framing and scene");
  expect(prompt).toContain("Never preserve its rendering defects");
  expect(prompt).toContain("hem and sleeve ends");
  expect(prompt).toContain("Never distort anatomy");
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
test("person identity and photographic look are distinct reference roles in one paid image request", async () => {
  let calls = 0;
  const transport = Object.assign(
    async (_input: unknown, init?: RequestInit) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      expect(
        body.input_references.map(
          (r: { image_url: { url: string } }) => r.image_url.url,
        ),
      ).toEqual(["garment", "person", "look", "previous"]);
      expect(body.prompt).toContain(
        "Reference 2 is the consented adult person reference",
      );
      expect(body.prompt).toContain("COMPOSITION REFERENCE: Reference 3");
      expect(body.prompt).toContain("Reference 4 is the prior generated frame");
      expect(body.prompt).toContain(
        "selected person reference overrides its face",
      );
      expect(body.prompt).toContain("Never copy its face, garment design");
      expect(body.n).toBe(1);
      return Response.json({
        data: [{ b64_json: btoa("synthetic"), media_type: "image/png" }],
        usage: { cost: 0.01 },
      });
    },
    { preconnect: fetch.preconnect },
  ) as typeof fetch;
  const adapter = openRouterAdapter(
    "synthetic-key",
    "https://synthetic.invalid",
    transport,
  );
  await adapter.generate(
    "synthetic",
    ["garment"],
    mockPlan(mockAnalysisFixture),
    "medium",
    { personImage: "person", lookImage: "look", previousImage: "previous" },
  );
  expect(calls).toBe(1);
});

test("explicit bust and bird-eye edits override generic garment crops and composition references", () => {
  const plan = mockPlan(mockAnalysisFixture);
  plan.camera.framing = "바스트 샷 · 가슴 위";
  plan.camera.angle = "버드아이 뷰 · 수직으로 내려다보기";
  const prompt = compilePhotographicPrompt(plan, 1, {
    personImage: "person",
    lookImage: "look",
    previousImage: "previous",
    reason: "composition",
    adjustments: "카메라는 머리 위에, 얼굴은 참조 인물 그대로",
  });
  expect(retailFraming(plan.camera.framing).coverage).toBe("upper_body");
  expect(prompt).toContain("MATCH its framing/crop");
  expect(prompt).toContain(plan.camera.framing);
  expect(prompt).toContain(plan.camera.angle);
  expect(prompt).toContain("mandatory identity evidence");
  expect(prompt).toContain("LATEST USER REVISION (highest priority");
  expect(prompt).not.toContain("Avoid a chest-up beauty portrait");
  expect(prompt).not.toContain(
    "texture bandwidth and skin-retouch strength ONLY",
  );
  expect(prompt).toContain("Never copy its face, garment design");
  plan.camera.referenceComposition = "inspire";
  expect(compilePhotographicPrompt(plan, 1, { lookImage: "look" })).toContain(
    "Borrow lighting and tonal rendering only",
  );
});

test("existing capture snapshots remain readable while new material-light corrections retain explicit shot choices", () => {
  const plan = mockPlan(mockAnalysisFixture);
  plan.model.pose = "Synthetic seated pose with lap against a step";
  plan.lighting =
    "Synthetic hard sunlight from upper left with weak wall bounce";
  plan.materialDirection = "Synthetic smooth coated textile; no invented weave";
  for (const captureVersion of [
    undefined,
    "photo-v3-reference",
    "photo-v4-directed-composition",
    "photo-v5-material-light",
    CAPTURE_PROTOCOL_VERSION,
  ]) {
    const prompt = compilePhotographicPrompt(plan, 1, {
      captureVersion,
      garmentAnalysis: {
        ...mockAnalysisFixture,
        materialGuess: {
          value: "Synthetic uncertain composition",
          confidence: 0.1,
        },
      },
      reason: "material_rendering",
      previousImage: "synthetic-prior",
      adjustments:
        "Synthetic preserve smooth finish and seated crop; repair only contact shading",
    });
    expect(prompt).toContain(`CAPTURE PROTOCOL ${CAPTURE_PROTOCOL_VERSION}`);
    expect(prompt).toContain(plan.model.pose);
    expect(prompt).toContain(plan.lighting);
    expect(prompt).toContain(plan.materialDirection);
    expect(prompt).toContain('"confidence":0.1');
    // A nearby support cannot simultaneously be required to sit 1.5m behind the adult.
    expect(prompt).toContain("freely separated background only");
    expect(prompt).toContain("actual body/cloth contact distance");
    expect(prompt).toContain("never float the subject away from a support");
    // Material correction must rebuild geometry/light, not blindly intensify grain/AO.
    expect(prompt).toContain("a uniform ambient-occlusion pass");
    expect(prompt).toContain("do not merely add grain");
    expect(prompt).toContain("Do not bake flat-lay/hanger shadows");
    expect(prompt).toContain("microscopic fibers merge with distance");
    expect(prompt).toContain(
      "do not turn uncertain material guesses into new visible fibers",
    );
    expect(prompt).toContain("Preserve hard sunlight when requested");
    expect(prompt).toContain(
      "never substitute a generic kangaroo/patch pocket",
    );
    expect(prompt).toContain("repair only contact shading");
    expect(prompt.indexOf("LATEST USER REVISION")).toBeGreaterThan(
      prompt.indexOf("MATERIALS AT THREE SCALES"),
    );
  }
});

test("matching a selected photographic reference releases numerical optics defaults and stale visual claims", () => {
  const plan = mockPlan(mockAnalysisFixture);
  plan.referenceNotes =
    "Synthetic observed side light; support and sleeve share visible focus";
  const matched = compilePhotographicPrompt(plan, 1, {
    lookImage: "synthetic-look",
  });
  expect(matched).toContain(plan.referenceNotes);
  expect(matched).toContain("REFERENCE OPTICS");
  expect(matched).toContain("Do not impose numerical lens");
  expect(matched).not.toContain("approximately f/");
  expect(matched).not.toContain("Approximate focus envelope");
  expect(matched).toContain("Reference 2's actual pixels");
  expect(matched).toContain("do not paste the reference garment's texture");
  // A plan's former observation text cannot stand in for a visual reference
  // that the user did not actually select for this generation.
  const withoutLook = compilePhotographicPrompt(plan, 1);
  expect(withoutLook).not.toContain(plan.referenceNotes);
  expect(withoutLook).toContain("No photographic-look image is attached");
  expect(withoutLook).toContain("approximately f/");
  plan.camera.referenceComposition = "inspire";
  const inspired = compilePhotographicPrompt(plan, 1, {
    lookImage: "synthetic-look",
  });
  expect(inspired).toContain("Borrow lighting and tonal rendering only");
  expect(inspired).not.toContain("REFERENCE OPTICS");
});
