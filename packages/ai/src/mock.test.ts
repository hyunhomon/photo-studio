import { describe, expect, spyOn, test } from "bun:test";
import { productAnalysisSchema } from "@photo-studio/schemas";
import { createMockAnalyzer } from "./index";

describe("mock analyzer", () => {
  test("returns validated isolated fixtures without any network call or invented bill", async () => {
    const network = spyOn(globalThis, "fetch").mockImplementation(
      Object.assign(
        async () => {
          throw new Error("Network is forbidden in mock tests");
        },
        { preconnect: globalThis.fetch.preconnect },
      ),
    );
    try {
      const adapter = createMockAnalyzer();
      const result = await adapter.analyzeProduct({
        imageRefs: ["fixture:shirt"],
        locale: "ko",
      });
      expect(productAnalysisSchema.safeParse(result.analysis).success).toBe(
        true,
      );
      expect(result.source).toBe("mock");
      expect(result.metrics.actualCostUsd).toBeNull();
      expect(result.metrics.costSource).toBe("unknown");
      result.analysis.colors.push("mutated");
      const next = await adapter.analyzeProduct({
        imageRefs: [],
        locale: "ko",
      });
      expect(next.analysis.colors).toEqual(["off-white"]);
      expect(network).not.toHaveBeenCalled();
    } finally {
      network.mockRestore();
    }
  });
  test("rejects invalid model output", () => {
    expect(
      productAnalysisSchema.safeParse({ garmentType: "shirt" }).success,
    ).toBe(false);
  });
});
