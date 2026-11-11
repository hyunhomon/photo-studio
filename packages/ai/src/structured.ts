import { z } from "zod";
import { shootPlanSchema } from "@photo-studio/schemas";

// These fields belong to application policy, not to a model's judgement.
// Strip unused provider metadata; required content, enums and limits stay validated.
export const providerPlanSchema = shootPlanSchema
  .omit({ aspectRatio: true, shootType: true })
  .extend({
    season: shootPlanSchema.shape.season.describe(
      "Season for the shoot, written in Korean.",
    ),
    mood: shootPlanSchema.shape.mood.describe(
      "Specific visual mood for the approved garment.",
    ),
    model: shootPlanSchema.shape.model
      .strip()
      .describe("An adult model's style and pose."),
    camera: shootPlanSchema.shape.camera.strip(),
    location: shootPlanSchema.shape.location.strip(),
    mustPreserve: shootPlanSchema.shape.mustPreserve.describe(
      "Nonempty garment invariants copied from the analysis, including color, logos, pattern, silhouette and details where applicable.",
    ),
  })
  .strip();
// Gemini supports enums; use the equivalent singleton enum for literals.
export function providerJsonSchema(schema: z.ZodType) {
  function portable(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(portable);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) =>
        key === "const" ? ["enum", [entry]] : [key, portable(entry)],
      ),
    );
  }
  return portable(z.toJSONSchema(schema));
}
const safePaths = new Set([
  "garmentType",
  "colors",
  "colors[]",
  "pattern",
  "materialGuess",
  "materialGuess.value",
  "materialGuess.confidence",
  "silhouette",
  "seasonGuess",
  "seasonGuess[]",
  "preservationPoints",
  "preservationPoints[]",
  "uncertainties",
  "uncertainties[]",
  "season",
  "mood",
  "shootType",
  "model",
  "model.style",
  "model.pose",
  "model.appearance",
  "camera.backgroundSeparation",
  "materialDirection",
  "camera",
  "camera.framing",
  "camera.angle",
  "location",
  "location.type",
  "location.time",
  "lighting",
  "mustPreserve",
  "mustPreserve[]",
  "aspectRatio",
  "garmentFidelityScore",
  "realismScore",
  "compositionScore",
  "flaggedIssues",
  "flaggedIssues[]",
  "flaggedIssues[].code",
  "flaggedIssues[].severity",
  "flaggedIssues[].reason",
  "needsHumanReview",
  "evaluationVersion",
]);
export interface OutputDiagnostic {
  reason:
    | "invalid_json"
    | "schema_mismatch"
    | "missing_content"
    | "truncated"
    | "blocked"
    | "invalid_image";
  issues: { field: string; code: string }[];
}
export class StructuredOutputFailure extends Error {
  constructor(public diagnostic: OutputDiagnostic) {
    super(diagnostic.reason);
  }
}
export function parseStructuredOutput<T>(
  schema: z.ZodType<T>,
  choice: unknown,
): T {
  const c = choice as {
    finish_reason?: string;
    message?: { content?: unknown; refusal?: unknown };
  } | null;
  if (c?.finish_reason === "length")
    throw new StructuredOutputFailure({ reason: "truncated", issues: [] });
  if (c?.finish_reason === "content_filter" || c?.message?.refusal)
    throw new StructuredOutputFailure({ reason: "blocked", issues: [] });
  let text = c?.message?.content;
  if (
    Array.isArray(text) &&
    text.every((p) => p && p.type === "text" && typeof p.text === "string")
  )
    text = text.map((p) => p.text).join("");
  if (typeof text !== "string" || !text.trim())
    throw new StructuredOutputFailure({
      reason: "missing_content",
      issues: [],
    });
  const jsonText = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(jsonText);
  let value: unknown;
  try {
    value = JSON.parse(fenced?.[1] ?? jsonText);
  } catch {
    throw new StructuredOutputFailure({ reason: "invalid_json", issues: [] });
  }
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  // Never retain values, provider text, unknown property names, or Zod messages.
  const issues = parsed.error.issues.slice(0, 12).map((issue) => {
    const path = issue.path
      .map((p, i) =>
        typeof p === "number" ? "[]" : `${i ? "." : ""}${String(p)}`,
      )
      .join("");
    return { field: safePaths.has(path) ? path : "response", code: issue.code };
  });
  throw new StructuredOutputFailure({ reason: "schema_mismatch", issues });
}
