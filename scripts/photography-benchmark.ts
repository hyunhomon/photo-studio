import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  CAPTURE_PROTOCOL_VERSION,
  compilePhotographicPrompt,
  captureProfiles,
  focusEnvelope,
  resolveCaptureProfile,
} from "../packages/ai/src/photography";
import { mockPlan, PROMPT_VERSION } from "../packages/ai/src/provider";
import { mockAnalysisFixture } from "../packages/ai/src/fixtures";

// Synthetic shot data only. This creates a reproducible offline test manifest;
// it does not call a provider, use a customer key, or assign image quality scores.
const base = mockPlan(mockAnalysisFixture);
base.mood = "Natural everyday fashion photograph";
base.location = {
  type: "matte plaster wall and rough stone floor",
  time: "late morning",
};
base.lighting =
  "large window camera-left, low wall bounce, contact shadows extending right";
base.model.appearance =
  "Fictional adult, relaxed gaze, slight natural asymmetry and modest visible skin texture";
base.materialDirection =
  "Keep the observed fabric weave; distinct matte plaster and rough stone, no invented wear";
const variants = [
  { id: "baseline", axis: "baseline", reason: null, adjustments: "" },
  {
    id: "light-focus",
    axis: "lighting_focus",
    reason: "lighting_focus",
    adjustments:
      "Keep pose and materials steady; make the key light and contact shadows consistent, with gradual depth falloff.",
  },
  {
    id: "human",
    axis: "human_naturalness",
    reason: "human_naturalness",
    adjustments:
      "Keep framing, light and garment steady; relax expression/shoulders and preserve individual skin/eye realism.",
  },
  {
    id: "materials",
    axis: "material_rendering",
    reason: "material_rendering",
    adjustments:
      "Keep the subject, light and camera steady; improve fabric drape and distinct surrounding roughness.",
  },
];
const cases = await Promise.all(
  variants.map(async (v) => {
    const prompt = compilePhotographicPrompt(base, 1, {
      reason: v.reason,
      adjustments: v.adjustments,
      previousImage: v.reason ? "synthetic-continuity-reference" : undefined,
    });
    const bytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(prompt),
    );
    return {
      ...v,
      promptHash: [...new Uint8Array(bytes)]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join(""),
      prompt,
    };
  }),
);
const output = resolve(import.meta.dir, "../.tmp/photography-benchmark");
await mkdir(output, { recursive: true });
await Bun.write(
  resolve(output, "manifest.json"),
  JSON.stringify(
    {
      synthetic: true,
      providerCalls: 0,
      promptVersion: PROMPT_VERSION,
      captureVersion: CAPTURE_PROTOCOL_VERSION,
      plan: base,
      focusProfiles: Object.fromEntries(
        (Object.keys(captureProfiles) as (keyof typeof captureProfiles)[]).map(
          (name) => {
            const profile = resolveCaptureProfile({
              ...base,
              camera: { ...base.camera, backgroundSeparation: name },
            });
            return [name, { ...profile, ...focusEnvelope(profile) }];
          },
        ),
      ),
      cases,
      humanValidationRequired: true,
    },
    null,
    2,
  ),
);
console.info(
  `PASS: ${cases.length} synthetic paired capture cases written to ignored .tmp/photography-benchmark. Provider calls: 0. No quality claims or scores.`,
);
