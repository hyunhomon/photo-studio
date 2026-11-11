import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { createMockAnalyzer } from "@photo-studio/ai";

export type ScaffoldWorkflowParams = { kind: "scaffold-smoke" };

// Infrastructure probe, not the product pipeline. No HTTP route creates jobs.
// This entrypoint can never call a real provider, even if AI_MODE is changed.
export class StudioWorkflow extends WorkflowEntrypoint<
  CloudflareBindings,
  ScaffoldWorkflowParams
> {
  async run(event: WorkflowEvent<ScaffoldWorkflowParams>, step: WorkflowStep) {
    if (event.payload.kind !== "scaffold-smoke")
      throw new Error("Unsupported scaffold operation");
    return step.do(
      "mock adapter probe",
      { retries: { limit: 0, delay: "1 second" } },
      async () => {
        const result = await createMockAnalyzer().analyzeProduct({
          imageRefs: [],
          locale: "ko",
        });
        return {
          source: result.source,
          stage: result.metrics.stage,
          actualCostUsd: result.metrics.actualCostUsd,
        };
      },
    );
  }
}
