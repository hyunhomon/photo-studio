import { expect, test } from "bun:test";
import {
  openRouterAdapter,
  InvalidOutputError,
  mockPlan,
  ProviderError,
} from "./provider";
import { mockAnalysisFixture } from "./fixtures";
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
        expect(wire.properties.aspectRatio).toBeUndefined();
        expect(wire.properties.shootType.enum).toEqual([
          "model_studio",
          "model_location",
        ]);
        const { aspectRatio: _ratio, ...plan } = mockPlan(mockAnalysisFixture);
        value = {
          ...plan,
          model: { ...plan.model, notes: "synthetic-unused-metadata" },
          unused: "synthetic-unused-metadata",
        };
      }
      if (stage === "quality_evaluation") {
        expect(wire.properties.needsHumanReview).toBeUndefined();
        value = {
          garmentFidelityScore: 0.7,
          realismScore: 0.8,
          compositionScore: 0.9,
          flaggedIssues: [],
          needsHumanReview: false,
          evaluationVersion: "untrusted",
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
    null,
    "synthetic",
  );
  expect(plan.value.aspectRatio).toBe("3:4");
  expect(plan.value.mustPreserve).toEqual(
    mockAnalysisFixture.preservationPoints,
  );
  expect(JSON.stringify(plan.value)).not.toContain("synthetic-unused-metadata");
  const quality = await adapter.evaluate("synthetic", [], "synthetic", []);
  expect(quality.value.needsHumanReview).toBe(true);
  expect(quality.value.evaluationVersion).toBe("v1");
  expect(calls).toBe(3);
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
          value.shootType = "synthetic-sensitive-model-value";
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
        expect(invalid.diagnostic.issues[0]?.field).toBe("shootType");
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
