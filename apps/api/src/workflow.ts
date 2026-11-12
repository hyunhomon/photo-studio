import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { createMockAnalyzer } from "@photo-studio/ai";
import type { Env } from "./env";
import { finishFailure, runPlanStage } from "./pipeline";
import { runGenerationStage } from "./generation";
import { createDb, jobs, eq } from "@photo-studio/db";
import { productAnalysisSchema } from "@photo-studio/schemas";
import { ensureAutomaticReference } from "./automatic-reference";
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
    if (event.payload.kind === "reference-search-smoke")
      return step.do(
        "automatic reference source probe",
        { retries: { limit: 0, delay: "1 second" }, timeout: "3 minutes" },
        async () => {
          const job = await createDb(this.env.DB)
            .select()
            .from(jobs)
            .where(eq(jobs.id, id))
            .get();
          if (!job) throw new Error("Missing operation");
          try {
            const snapshot = JSON.parse(job.requestJson) as {
              analysisSnapshot: unknown;
            };
            const selected = await ensureAutomaticReference(
              this.env,
              job,
              productAnalysisSchema.parse(snapshot.analysisSnapshot),
              { forceLive: true },
            );
            await this.env.DB.prepare(
              "UPDATE generation_jobs SET status='completed',stage='review_plan',finished_at=? WHERE id=? AND user_id=? AND status IN ('queued','running')",
            )
              .bind(Date.now(), job.id, job.userId)
              .run();
            return {
              status: selected.status,
              provider: selected.provider,
              assetStored: Boolean(selected.assetId),
            };
          } catch (error) {
            await finishFailure(this.env, job.id, error);
            throw error;
          }
        },
      );
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
