import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { createMockAnalyzer } from "@photo-studio/ai";
import type { Env } from "./env";
import { finishFailure, runPlanStage } from "./pipeline";
import { runGenerationStage } from "./generation";
export type StudioWorkflowParams = { kind: string; jobId?: string };
export class StudioWorkflow extends WorkflowEntrypoint<
  Env,
  StudioWorkflowParams
> {
  async run(event: WorkflowEvent<StudioWorkflowParams>, step: WorkflowStep) {
    if (event.payload.kind === "scaffold-smoke")
      return step.do(
        "mock adapter probe",
        { retries: { limit: 0, delay: "1 second" } },
        async () => {
          const r = await createMockAnalyzer().analyzeProduct({
            imageRefs: [],
            locale: "ko",
          });
          return {
            source: r.source,
            stage: r.metrics.stage,
            actualCostUsd: r.metrics.actualCostUsd,
          };
        },
      );
    const id = event.payload.jobId;
    if (!id) throw new Error("Missing operation");
    try {
      if (event.payload.kind === "generate")
        for (const stage of ["generation"] as const) {
          await step.do(
            stage,
            { retries: { limit: 0, delay: "1 second" }, timeout: "4 minutes" },
            async () => {
              await runGenerationStage(this.env, id, stage);
              return { stored: true };
            },
          );
        }
      if (event.payload.kind === "plan")
        for (const stage of ["analysis", "planning"] as const) {
          await step.do(
            stage,
            { retries: { limit: 0, delay: "1 second" }, timeout: "3 minutes" },
            async () => {
              await runPlanStage(this.env, id, stage);
              return { stored: true };
            },
          );
        }
    } catch {
      await step.do(
        "record failure",
        { retries: { limit: 2, delay: "1 second" } },
        async () => {
          await finishFailure(this.env, id, new Error("Workflow interrupted"));
          return { stored: true };
        },
      );
    }
    return { stored: true };
  }
}
