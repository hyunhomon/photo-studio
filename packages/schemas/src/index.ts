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

const shortText = z.string().min(1).max(500);
export const shootPlanSchema = z
  .object({
    season: shortText,
    mood: shortText,
    shootType: z.enum(["model_studio", "model_location"]),
    model: z.object({ style: shortText, pose: shortText }).strict(),
    camera: z.object({ framing: shortText, angle: shortText }).strict(),
    location: z.object({ type: shortText, time: shortText }).strict(),
    lighting: shortText,
    mustPreserve: z.array(shortText).min(1).max(20),
    aspectRatio: z.literal("3:4"),
  })
  .strict();
export type ShootPlan = z.infer<typeof shootPlanSchema>;
export interface PlanDto {
  id: string;
  version: number;
  status: string;
  spec: ShootPlan;
  createdAt: number;
}
export interface AttemptDto {
  stage: string;
  model: string;
  status: string;
  durationMs: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  actualCostUsd: number | null;
  promptVersion: string;
}
export interface JobDto {
  id: string;
  productId: string;
  kind: string;
  status: string;
  stage: string;
  errorCode: string | null;
  createdAt: number;
  finishedAt: number | null;
  attempts: AttemptDto[];
}
export interface PipelineDto {
  plans: PlanDto[];
  jobs: JobDto[];
}
export const planRequestSchema = z
  .object({
    consent: z.literal(true),
    idempotencyKey: z.uuid(),
    presetId: z.uuid().nullable().default(null),
    description: z.string().trim().max(1000).default(""),
  })
  .strict();

export const qualitySchema = z
  .object({
    garmentFidelityScore: z.number().min(0).max(1),
    realismScore: z.number().min(0).max(1),
    compositionScore: z.number().min(0).max(1),
    flaggedIssues: z
      .array(
        z
          .object({
            code: z.string().min(1).max(80),
            severity: z.enum(["low", "medium", "high"]),
            reason: z.string().min(1).max(500),
          })
          .strict(),
      )
      .max(20),
    needsHumanReview: z.literal(true),
    evaluationVersion: z.literal("v1"),
  })
  .strict();
export type QualityEvaluation = z.infer<typeof qualitySchema>;
export const rejectionReasonSchema = z.enum([
  "color_change",
  "logo_distortion",
  "pattern_change",
  "silhouette_change",
  "missing_detail",
  "unrealistic",
  "composition",
  "other",
]);
export const generateRequestSchema = z
  .object({
    consent: z.literal(true),
    idempotencyKey: z.uuid(),
    planId: z.uuid(),
    quality: z.enum(["medium", "high"]),
    count: z.literal(1),
    regenerationOf: z.uuid().nullable().default(null),
    regenerationReason: rejectionReasonSchema.nullable().default(null),
  })
  .strict()
  .refine((v) => Boolean(v.regenerationOf) === Boolean(v.regenerationReason), {
    message: "Regeneration requires a source and reason",
  });
export const feedbackSchema = z
  .object({
    decision: z.enum(["accepted", "rejected"]),
    reason: rejectionReasonSchema.nullable().default(null),
    note: z.string().trim().max(1000).default(""),
  })
  .strict()
  .refine((v) => v.decision !== "rejected" || v.reason !== null, {
    message: "Rejection needs a reason",
  });
export type FeedbackInput = z.infer<typeof feedbackSchema>;
export interface ResultDto {
  asset: AssetDto;
  quality: QualityEvaluation | null;
  feedback: (FeedbackInput & { createdAt: number }) | null;
  regenerationOf: string | null;
  regenerationReason: string | null;
  mock: boolean;
}
