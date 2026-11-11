import { z } from "zod";

export const healthSchema = z.object({
  data: z.object({
    status: z.literal("ok"),
    service: z.literal("photo-studio-api"),
    phase: z.number().int().min(0),
    aiMode: z.enum(["mock", "openrouter"]),
  }),
});

export const productAnalysisSchema = z.object({
  garmentType: z.string().min(1),
  colors: z.array(z.string()).min(1),
  pattern: z.string(),
  materialGuess: z.object({
    value: z.string(),
    confidence: z.number().min(0).max(1),
  }),
  silhouette: z.string(),
  seasonGuess: z.array(z.string()),
  preservationPoints: z.array(z.string()).min(1),
  uncertainties: z.array(z.string()).min(1),
});

// Every stage keeps provider-reported costs separate from estimates. A mock
// response has no actual provider bill, so its actual cost must remain null.
export const callMetricsSchema = z.object({
  stage: z.enum(["analysis", "planning", "generation", "evaluation"]),
  modelId: z.string(),
  promptVersion: z.string(),
  providerRequestId: z.string().nullable(),
  durationMs: z.number().nonnegative(),
  outcome: z.enum(["succeeded", "failed", "outcome_unknown"]),
  usage: z.object({
    tokensIn: z.number().nullable(),
    tokensOut: z.number().nullable(),
  }),
  actualCostUsd: z.number().nonnegative().nullable(),
  estimatedCostUsd: z.number().nonnegative().nullable(),
  costSource: z.enum(["provider_reported", "estimated", "unknown"]),
});

export type ProductAnalysis = z.infer<typeof productAnalysisSchema>;
export type CallMetrics = z.infer<typeof callMetricsSchema>;
export type Health = z.infer<typeof healthSchema>;

export const projectInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1000).default(""),
  })
  .strict();
export const presetInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    season: z.string().trim().max(80).default("spring-summer"),
    mood: z.string().trim().min(1).max(500),
    modelStyle: z.string().trim().min(1).max(500),
    location: z.string().trim().min(1).max(500),
    lighting: z.string().trim().min(1).max(300),
    shootType: z
      .enum(["model_studio", "model_location"])
      .default("model_studio"),
  })
  .strict();
export type PresetInput = z.infer<typeof presetInputSchema>;
export interface ProjectDto {
  id: string;
  name: string;
  description: string;
  status: string;
  createdAt: number;
  updatedAt: number;
}
export interface AssetDto {
  id: string;
  productId: string;
  kind: string;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
  createdAt: number;
}
export interface ProductDto {
  id: string;
  projectId: string;
  name: string;
  status: string;
  analysis: ProductAnalysis | null;
  createdAt: number;
  assets: AssetDto[];
}
export type PresetDto = PresetInput & { id: string; updatedAt: number };
