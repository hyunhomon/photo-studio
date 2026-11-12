import { expect, test } from "bun:test";
import {
  openRouterAdapter,
  InvalidOutputError,
  mockPlan,
  ProviderError,
} from "./provider";
import { mockAnalysisFixture } from "./fixtures";
import { presetInputSchema } from "@photo-studio/schemas";
test("planning derives editable photographic choices from a selected visual reference in the existing single planning request", async () => {
  let calls = 0;
  const transport = Object.assign(
    async (_input: unknown, init?: RequestInit) => {
      calls++;
      const request = JSON.parse(String(init?.body));
      expect(request.response_format.json_schema.name).toBe("shoot_plan");
      const content = request.messages[1].content;
      expect(
        content
          .filter((part: { type: string }) => part.type === "image_url")
          .map((part: { image_url: { url: string } }) => part.image_url.url),
      ).toEqual(["synthetic-person-reference", "synthetic-look-reference"]);
      expect(content[0].text).toContain("lighting");
      expect(content[0].text).toContain("Reconstruct its camera viewpoint");
      return Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                ...mockPlan(mockAnalysisFixture),
                referenceNotes: "Synthetic side light and restrained contrast",
              }),
            },
          },
        ],
        usage: { cost: 0.0001 },
      });
    },
    { preconnect: fetch.preconnect },
  ) as typeof fetch;
  const adapter = openRouterAdapter(
    "synthetic-key",
    "https://synthetic.invalid/planning",
    transport,
  );
  const response = await adapter.plan(
    "synthetic",
    mockAnalysisFixture,
    null,
    "Synthetic request",
    {
      personImage: "synthetic-person-reference",
      lookImage: "synthetic-look-reference",
    },
  );
  expect(response.value.referenceNotes).toBe(
    "Synthetic side light and restrained contrast",
  );
  expect(response.usage.actualCostUsd).toBe(0.0001);
  expect(calls).toBe(1);
});

test("a photographic observation brief reaches generation with original evidence and current edits in two provider calls", async () => {
  const notes =
    "구도: 합성 계단에 기대는 반신. 빛: 왼쪽 단단한 광원, 계단 그림자는 오른쪽. 초점: 소매와 받침은 함께 선명. 표면: 천 조직은 가까운 부분만 보임. 한계: 정확한 조리개는 확인 불가.";
  const planned = { ...mockPlan(mockAnalysisFixture), referenceNotes: notes };
  const stages: string[] = [];
  const transport = Object.assign(
    async (input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      if (String(input).endsWith("/images")) {
        stages.push("generation");
        expect(
          body.input_references.map(
            (r: { image_url: { url: string } }) => r.image_url.url,
          ),
        ).toEqual(["synthetic-garment", "synthetic-look"]);
        expect(body.n).toBe(1);
        expect(body.prompt).toContain(notes);
        expect(body.prompt).toContain("Synthetic explicit high camera angle");
        expect(body.prompt).toContain(
          "Synthetic retain pose; change only contact shadow",
        );
        expect(body.prompt).toContain("original garment under that same light");
        expect(body.prompt).not.toContain("approximately f/");
        return Response.json({
          data: [
            { b64_json: btoa("synthetic-image"), media_type: "image/png" },
          ],
        });
      }
      stages.push("planning");
      const task = JSON.parse(body.messages[1].content[0].text);
      expect(task.referenceTask).toContain("구도 / 빛 / 초점 / 표면 / 한계");
      expect(task.referenceTask).toContain(
        "actual camera, pose, location, lighting and materialDirection",
      );
      expect(task.referenceTask).toContain("Unclear details belong in 한계");
      expect(body.messages[1].content[1].image_url.url).toBe("synthetic-look");
      return Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: { content: JSON.stringify(planned) },
          },
        ],
      });
    },
    { preconnect: fetch.preconnect },
  ) as typeof fetch;
  const adapter = openRouterAdapter(
    "synthetic-key",
    "https://synthetic.invalid/reference-evidence",
    transport,
  );
  const plan = await adapter.plan(
    "synthetic-vision",
    mockAnalysisFixture,
    null,
    "Synthetic brief",
    { lookImage: "synthetic-look" },
  );
  await adapter.generate(
    "synthetic-image",
    ["synthetic-garment"],
    {
      ...plan.value,
      camera: {
        ...plan.value.camera,
        angle: "Synthetic explicit high camera angle",
      },
    },
    "medium",
    {
      lookImage: "synthetic-look",
      adjustments: "Synthetic retain pose; change only contact shadow",
    },
  );
  expect(stages).toEqual(["planning", "generation"]);
});
test("portable planning schema, lossless JSON parsing and app-owned constants tolerate provider formatting without changing garment facts", async () => {
  let calls = 0;
  const transport = Object.assign(
    async (_input: unknown, init?: RequestInit) => {
      calls++;
      const request = JSON.parse(String(init?.body));
      const wire = request.response_format.json_schema.schema;
      const stage = request.response_format.json_schema.name;
      expect(JSON.stringify(wire)).not.toContain('"const"');
      let value: unknown = mockAnalysisFixture;
      if (stage === "shoot_plan") {
        expect(JSON.stringify(request.messages)).not.toContain(
          "model_location",
        );
        expect(wire.properties.aspectRatio).toBeUndefined();
        expect(wire.properties.shootType).toBeUndefined();
        const { aspectRatio: _ratio, ...plan } = mockPlan(mockAnalysisFixture);
        value = {
          ...plan,
          model: { ...plan.model, notes: "synthetic-unused-metadata" },
          unused: "synthetic-unused-metadata",
        };
      }
      return Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: [
                {
                  type: "text",
                  text: `\uFEFF\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\``,
                },
              ],
            },
          },
        ],
        usage: { cost: 0.0001 },
      });
    },
    { preconnect: fetch.preconnect },
  ) as typeof fetch;
  const adapter = openRouterAdapter(
    "synthetic-key",
    "https://synthetic.invalid/portable",
    transport,
  );
  const analysis = await adapter.analyze("synthetic", [], "synthetic");
  expect(analysis.value).toEqual(mockAnalysisFixture);
  const plan = await adapter.plan(
    "synthetic",
    analysis.value,
    presetInputSchema.parse({
      name: "Synthetic legacy preset",
      mood: "Synthetic natural photograph",
      modelStyle: "Synthetic adult",
      location: "Synthetic wall",
      lighting: "Synthetic soft window",
      shootType: "model_location",
    }),
    "synthetic",
  );
  expect(plan.value.aspectRatio).toBe("3:4");
  expect(plan.value.mustPreserve).toEqual(
    mockAnalysisFixture.preservationPoints,
  );
  expect(JSON.stringify(plan.value)).not.toContain("synthetic-unused-metadata");
  expect(calls).toBe(2);
});
test("invalid or truncated paid planning output retains cost and only safe validation categories, with no retries", async () => {
  for (const kind of [
    "missing_field",
    "invalid_enum",
    "invalid_json",
    "truncated",
    "blocked",
  ]) {
    let calls = 0;
    const transport = Object.assign(
      async () => {
        calls++;
        const value: Record<string, unknown> = {
          ...mockPlan(mockAnalysisFixture),
        };
        if (kind === "missing_field") delete value.lighting;
        if (kind === "invalid_enum")
          value.camera = {
            ...(value.camera as object),
            backgroundSeparation: "synthetic-sensitive-model-value",
          };
        return Response.json({
          choices: [
            {
              finish_reason:
                kind === "truncated"
                  ? "length"
                  : kind === "blocked"
                    ? "content_filter"
                    : "stop",
              message: {
                content:
                  kind === "invalid_json"
                    ? "synthetic-sensitive-non-json"
                    : JSON.stringify(value),
              },
            },
          ],
          usage: { cost: 0.0000965, completion_tokens: 198 },
        });
      },
      { preconnect: fetch.preconnect },
    ) as typeof fetch;
    const adapter = openRouterAdapter(
      "synthetic-key",
      "https://synthetic.invalid/invalid",
      transport,
    );
    try {
      await adapter.plan("synthetic", mockAnalysisFixture, null, "synthetic");
      throw new Error("Expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidOutputError);
      const invalid = error as InvalidOutputError;
      expect(invalid.usage.actualCostUsd).toBe(0.0000965);
      expect(invalid.usage.tokensOut).toBe(198);
      expect(JSON.stringify(invalid.diagnostic)).not.toContain(
        "synthetic-sensitive",
      );
      if (kind === "missing_field")
        expect(invalid.diagnostic.issues[0]?.field).toBe("lighting");
      if (kind === "invalid_enum")
        expect(invalid.diagnostic.issues[0]?.field).toBe(
          "camera.backgroundSeparation",
        );
    }
    expect(calls).toBe(1);
  }
});
test("provider redirects fail closed without retries or credential forwarding", async () => {
  let calls = 0;
  const transport = Object.assign(
    async (_input: unknown, init?: RequestInit) => {
      calls++;
      expect(init?.redirect).toBe("manual");
      return new Response(null, {
        status: 307,
        headers: { Location: "https://untrusted.invalid" },
      });
    },
    { preconnect: fetch.preconnect },
  ) as typeof fetch;
  const adapter = openRouterAdapter(
    "synthetic-key",
    "https://synthetic.invalid/redirect-contract",
    transport,
  );
  await expect(
    adapter.preflight("synthetic/vision", "analysis"),
  ).rejects.toBeInstanceOf(ProviderError);
  await expect(
    adapter.preflight("synthetic/image", "generation"),
  ).rejects.toBeInstanceOf(ProviderError);
  await expect(
    adapter.analyze("synthetic/vision", [], "synthetic"),
  ).rejects.toBeInstanceOf(ProviderError);
  await expect(
    adapter.generate(
      "synthetic/image",
      [],
      mockPlan(mockAnalysisFixture),
      "medium",
    ),
  ).rejects.toBeInstanceOf(ProviderError);
  expect(calls).toBe(4);
});
test("OpenRouter structured contract uses vision references and preserves actual/null costs without retries", async () => {
  let paid = 0,
    invalid = false;
  const transport = Object.assign(
    async (input: string | URL | Request, init?: RequestInit) => {
      expect(init?.redirect).toBe("manual");
      if (String(input).endsWith("/models"))
        return Response.json({
          data: [
            {
              id: "synthetic/vision",
              architecture: { input_modalities: ["image", "text"] },
              supported_parameters: ["structured_outputs", "response_format"],
            },
          ],
        });
      paid++;
      const payload = JSON.parse(String(init?.body));
      expect(payload.response_format.json_schema.strict).toBe(true);
      expect(payload.messages[1].content[1].image_url.url).toBe(
        "data:image/png;base64,synthetic",
      );
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        "Bearer synthetic-key",
      );
      return Response.json({
        id: "synthetic-response",
        choices: [
          {
            message: {
              content: JSON.stringify(invalid ? {} : mockAnalysisFixture),
            },
          },
        ],
        usage: {
          prompt_tokens: 12,
          completion_tokens: 34,
          ...(invalid ? { cost: 0.00007 } : {}),
        },
      });
    },
    { preconnect: fetch.preconnect },
  ) as typeof fetch;
  const adapter = openRouterAdapter(
    "synthetic-key",
    "https://synthetic.invalid/v1",
    transport,
  );
  await adapter.preflight("synthetic/vision", "analysis");
  const result = await adapter.analyze(
    "synthetic/vision",
    ["data:image/png;base64,synthetic"],
    "test",
  );
  expect(result.usage.actualCostUsd).toBeNull();
  expect(result.usage.tokensIn).toBe(12);
  invalid = true;
  try {
    await adapter.analyze(
      "synthetic/vision",
      ["data:image/png;base64,synthetic"],
      "test",
    );
    throw new Error("Expected output validation failure");
  } catch (e) {
    expect(e).toBeInstanceOf(InvalidOutputError);
    expect((e as InvalidOutputError).usage.actualCostUsd).toBe(0.00007);
  }
  expect(paid).toBe(2);
});

test("Images API capability checks, one reference request, provider cost and uncertain response contract", async () => {
  let paid = 0,
    fail = false;
  const transport = Object.assign(
    async (input: string | URL | Request, init?: RequestInit) => {
      expect(init?.redirect).toBe("manual");
      if (String(input).endsWith("/images/models"))
        return Response.json({
          data: [
            {
              id: "openai/gpt-image-2",
              architecture: {
                input_modalities: ["text", "image"],
                output_modalities: ["image"],
              },
              supported_parameters: {
                aspect_ratio: { values: ["3:4"] },
                output_format: { values: ["png"] },
                quality: { values: ["medium", "high"] },
                n: { min: 1, max: 10 },
                input_references: { min: 0, max: 16 },
              },
            },
          ],
        });
      paid++;
      if (fail) throw new Error("Synthetic lost response");
      expect(String(input).endsWith("/images")).toBe(true);
      const payload = JSON.parse(String(init?.body));
      expect(payload.n).toBe(1);
      expect(payload.input_references).toEqual([
        {
          type: "image_url",
          image_url: { url: "data:image/png;base64,synthetic" },
        },
      ]);
      expect(payload.provider.allow_fallbacks).toBe(false);
      expect(payload.aspect_ratio).toBe("3:4");
      return Response.json({
        data: [{ b64_json: btoa("synthetic-bytes"), media_type: "image/png" }],
        usage: { cost: 0.014, prompt_tokens: 3, completion_tokens: 5 },
      });
    },
    { preconnect: fetch.preconnect },
  ) as typeof fetch;
  const adapter = openRouterAdapter(
    "synthetic-key",
    "https://synthetic.invalid/images-contract",
    transport,
  );
  await expect(
    adapter.preflight("unsupported", "generation", "medium"),
  ).rejects.toBeInstanceOf(ProviderError);
  expect(paid).toBe(0);
  await adapter.preflight("openai/gpt-image-2", "generation", "high");
  const r = await adapter.generate(
    "openai/gpt-image-2",
    ["data:image/png;base64,synthetic"],
    mockPlan(mockAnalysisFixture),
    "high",
  );
  expect(new TextDecoder().decode(r.value.bytes)).toBe("synthetic-bytes");
  expect(r.usage.actualCostUsd).toBe(0.014);
  fail = true;
  try {
    await adapter.generate(
      "openai/gpt-image-2",
      [],
      mockPlan(mockAnalysisFixture),
      "medium",
    );
    throw new Error("Expected uncertain response");
  } catch (e) {
    expect((e as ProviderError).unknownOutcome).toBe(true);
  }
  expect(paid).toBe(2);
});

test("observed textile evidence survives the existing analysis-plan-image sequence with one call per stage", async () => {
  const analysis = {
    ...mockAnalysisFixture,
    materialGuess: {
      value: "Synthetic uncertain textile composition",
      confidence: 0.1,
    },
    preservationPoints: [
      "Synthetic fine heather yarn, smoother seam tape and vertical ribbed cuffs",
    ],
    uncertainties: [
      "Synthetic fiber composition and underside construction unresolved",
    ],
  };
  const plan = mockPlan(analysis);
  plan.model.pose = "Synthetic seated pose on a step";
  plan.materialDirection =
    "Synthetic retain fine yarn scale with compression at the lap and sleeve contact";
  const stages: string[] = [];
  const transport = Object.assign(
    async (input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      if (String(input).endsWith("/images")) {
        stages.push("generation");
        expect(body.n).toBe(1);
        expect(
          body.input_references.map(
            (r: { image_url: { url: string } }) => r.image_url.url,
          ),
        ).toEqual([
          "synthetic-garment",
          "synthetic-person",
          "synthetic-composition",
          "synthetic-previous",
        ]);
        expect(body.prompt).toContain(JSON.stringify(analysis));
        expect(body.prompt).toContain(plan.materialDirection);
        expect(body.prompt).toContain("CLOTH CONTACT AND SHADOWS");
        expect(body.prompt).toContain("SOURCE MATERIAL VS SOURCE LIGHT");
        expect(body.prompt).toContain(
          "Synthetic keep frame unchanged; strengthen lap contact, not all shadows",
        );
        return Response.json({
          data: [
            { b64_json: btoa("synthetic-image"), media_type: "image/png" },
          ],
          usage: { cost: 0.01 },
        });
      }
      const stage = body.response_format.json_schema.name;
      stages.push(stage);
      const content = body.messages[1].content;
      const task = JSON.parse(content[0].text);
      if (stage === "product_analysis") {
        expect(task.task).toContain("visible textile evidence");
        expect(task.task).toContain(
          "unresolvable weave, nap or thickness belongs in uncertainties",
        );
        expect(content[1].image_url.url).toBe("synthetic-garment");
      } else {
        expect(stage).toBe("shoot_plan");
        expect(task.analysis).toEqual(analysis);
        expect(task.materialTask).toContain(
          "where the chosen pose creates compression or tension",
        );
        expect(task.lightingTask).toContain(
          "actual contact with its seat/step/wall",
        );
      }
      return Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify(
                stage === "product_analysis" ? analysis : plan,
              ),
            },
          },
        ],
        usage: { cost: 0.0001 },
      });
    },
    { preconnect: fetch.preconnect },
  ) as typeof fetch;
  const adapter = openRouterAdapter(
    "synthetic-key",
    "https://synthetic.invalid/material-contract",
    transport,
  );
  const observed = await adapter.analyze(
    "synthetic-vision",
    ["synthetic-garment"],
    "synthetic",
  );
  const planned = await adapter.plan(
    "synthetic-vision",
    observed.value,
    null,
    "synthetic",
    { personImage: "synthetic-person", lookImage: "synthetic-composition" },
  );
  const result = await adapter.generate(
    "synthetic-image",
    ["synthetic-garment"],
    planned.value,
    "medium",
    {
      garmentAnalysis: observed.value,
      personImage: "synthetic-person",
      lookImage: "synthetic-composition",
      previousImage: "synthetic-previous",
      reason: "material_rendering",
      adjustments:
        "Synthetic keep frame unchanged; strengthen lap contact, not all shadows",
    },
  );
  expect(stages).toEqual(["product_analysis", "shoot_plan", "generation"]);
  expect(result.usage.actualCostUsd).toBe(0.01);
  expect(observed.value.materialGuess.confidence).toBe(0.1);
});
