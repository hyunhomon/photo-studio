import { expect, test } from "bun:test";
import { openRouterAdapter, InvalidOutputError } from "./provider";
import { mockAnalysisFixture } from "./fixtures";
test("OpenRouter structured contract uses vision references and preserves actual/null costs without retries", async () => {
  let paid = 0,
    invalid = false;
  const transport = Object.assign(
    async (input: string | URL | Request, init?: RequestInit) => {
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
