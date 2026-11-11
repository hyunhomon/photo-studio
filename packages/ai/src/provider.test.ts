import { expect, test } from "bun:test";
import {
  openRouterAdapter,
  InvalidOutputError,
  mockPlan,
  ProviderError,
} from "./provider";
import { mockAnalysisFixture } from "./fixtures";
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
