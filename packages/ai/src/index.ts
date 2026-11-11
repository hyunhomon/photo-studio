import {
  type CallMetrics,
  callMetricsSchema,
  type ProductAnalysis,
  productAnalysisSchema,
} from "@photo-studio/schemas";
import { mockAnalysisFixture } from "./fixtures";

export interface AnalysisResult {
  source: "mock";
  analysis: ProductAnalysis;
  metrics: CallMetrics;
}

// Phase 0 only implements analysis fixtures. Planning, generation and evaluation
// adapters are deliberately absent until their respective vertical slices.
export interface ProductAnalyzer {
  analyzeProduct(input: {
    imageRefs: readonly string[];
    locale: string;
  }): Promise<AnalysisResult>;
}

export function createMockAnalyzer(): ProductAnalyzer {
  return {
    async analyzeProduct() {
      return {
        source: "mock",
        analysis: productAnalysisSchema.parse(mockAnalysisFixture),
        metrics: callMetricsSchema.parse({
          stage: "analysis",
          modelId: "mock/product-analyzer-v1",
          promptVersion: "mock-v1",
          providerRequestId: null,
          durationMs: 0,
          outcome: "succeeded",
          usage: { tokensIn: null, tokensOut: null },
          actualCostUsd: null,
          estimatedCostUsd: null,
          costSource: "unknown",
        }),
      };
    },
  };
}
