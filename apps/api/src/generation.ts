import { Hono } from "hono";
import {
  and,
  assets,
  attempts,
  createDb,
  desc,
  eq,
  jobs,
  shootPlans,
} from "@photo-studio/db";
import {
  type ResultDto,
  type ShootPlan,
  generateRequestSchema,
  productAnalysisSchema,
  shootPlanSchema,
} from "@photo-studio/schemas";
import {
  CAPTURE_PROTOCOL_VERSION,
  ProviderError,
  type ProviderUsage,
} from "@photo-studio/ai";
import type { AppContext, Env } from "./env";
import { AppError, notFound } from "./errors";
import { assetDto, ownedProduct } from "./resources";
import {
  type PlanSnapshot,
  type PipelineDeps,
  type JobRow,
  finishFailure,
  imageData,
  insertJob,
  jobActive,
  jobDto,
  paidStage,
  resolveAdapter,
  sourceSnapshot,
} from "./pipeline";
import { clearObjectQueue, deleteObject, queueObject } from "./storage";
import { normalizeImage } from "./images";
import { rateLimit } from "./auth";

export interface GenerationSnapshot extends PlanSnapshot {
  planId: string;
  plan: ShootPlan;
  quality: "medium" | "high";
  regenerationOf: string | null;
  regenerationReason: string | null;
  adjustments?: string;
  captureVersion?: string;
  reviewMode?: "manual";
  personReferenceId?: string | null;
  lookReferenceId?: string | null;
  referenceConsent?: boolean;
}
export const generatedKey = (job: JobRow) =>
  `${job.userId}/${job.productId}/generated/${job.id}.png`;
async function recordUsage(
  env: Env,
  job: JobRow,
  stage: string,
  usage: ProviderUsage,
) {
  await createDb(env.DB)
    .update(attempts)
    .set(usage)
    .where(
      and(
        eq(attempts.jobId, job.id),
        eq(attempts.stage, stage),
        eq(attempts.userId, job.userId),
      ),
    );
}
export async function runGenerationStage(
  env: Env,
  jobId: string,
  stage: "generation" | "evaluation",
  deps: PipelineDeps = {},
) {
  // Retired evaluation steps from older workflow definitions must never call AI.
  if (stage === "evaluation") return;
  const db = createDb(env.DB),
    job = await db.select().from(jobs).where(eq(jobs.id, jobId)).get();
  if (!job) return;
  try {
    await jobActive(env, job);
    const input = JSON.parse(job.requestJson) as GenerationSnapshot;
    if (
      (input.personReferenceId || input.lookReferenceId) &&
      !input.referenceConsent
    )
      throw new ProviderError("REFERENCE_CONSENT_REQUIRED");
    const adapter = await (deps.adapter ?? resolveAdapter)(env, job);
    await adapter.preflight(
      input.imageModel,
      stage,
      input.quality,
      input.sourceIds.length +
        Number(Boolean(input.personReferenceId)) +
        Number(Boolean(input.lookReferenceId)) +
        Number(Boolean(input.regenerationOf)),
    );
    const references = await imageData(env, job, [
      ...input.sourceIds,
      ...(input.personReferenceId ? [input.personReferenceId] : []),
      ...(input.lookReferenceId ? [input.lookReferenceId] : []),
      ...(input.regenerationOf ? [input.regenerationOf] : []),
    ]);
    const sources = references.slice(0, input.sourceIds.length);
    let referenceIndex = input.sourceIds.length;
    const personImage = input.personReferenceId
      ? references[referenceIndex++]
      : undefined;
    const lookImage = input.lookReferenceId
      ? references[referenceIndex++]
      : undefined;
    const previousImage = input.regenerationOf ? references.at(-1) : undefined;
    if (stage === "generation") {
      await paidStage(env, job, stage, input.imageModel, async () => {
        const result = await adapter.generate(
          input.imageModel,
          sources,
          input.plan,
          input.quality,
          {
            captureVersion: input.captureVersion ?? CAPTURE_PROTOCOL_VERSION,
            reason: input.regenerationReason,
            adjustments: input.adjustments,
            previousImage,
            garmentAnalysis: input.analysisSnapshot,
            personImage,
            lookImage,
          },
        );
        await recordUsage(env, job, stage, result.usage);
        await jobActive(env, job);
        const image = await normalizeImage(
            result.value.bytes,
            result.value.mimeType,
          ),
          key = generatedKey(job);
        await queueObject(env, key);
        await jobActive(env, job);
        await env.ASSETS.put(key, image.bytes, {
          httpMetadata: { contentType: image.mimeType },
        });
        const inserted = await env.DB.prepare(
          "INSERT OR IGNORE INTO assets(id,user_id,product_id,job_id,kind,r2_key,mime_type,size_bytes,width,height,created_at) SELECT ?,j.user_id,j.product_id,j.id,'generated',?,?,?,?,?,? FROM generation_jobs j JOIN products p ON p.id=j.product_id AND p.user_id=j.user_id JOIN users u ON u.id=j.user_id WHERE j.id=? AND j.user_id=? AND j.status='running' AND p.status='ready' AND u.status='active'",
        )
          .bind(
            job.id,
            key,
            image.mimeType,
            image.bytes.length,
            image.width,
            image.height,
            Date.now(),
            job.id,
            job.userId,
          )
          .run();
        if (!inserted.meta.changes) {
          await deleteObject(env, key);
          throw new ProviderError("JOB_CANCELLED");
        }
        await clearObjectQueue(env, key);
        return { value: { assetId: job.id }, usage: result.usage };
      });
    }
    await db
      .update(jobs)
      .set({ status: "needs_review", stage: "review", finishedAt: Date.now() })
      .where(and(eq(jobs.id, job.id), eq(jobs.userId, job.userId)));
  } catch (e) {
    await finishFailure(env, job.id, e);
  }
}

async function ownedGenerated(env: Env, userId: string, id: string) {
  const row = await createDb(env.DB)
    .select()
    .from(assets)
    .where(
      and(
        eq(assets.id, id),
        eq(assets.userId, userId),
        eq(assets.kind, "generated"),
      ),
    )
    .get();
  if (!row) throw notFound();
  await ownedProduct(env, userId, row.productId);
  return row;
}
export function generationRoutes() {
  const api = new Hono<AppContext>();
  api.post("/products/:id/generate", async (c) => {
    const identity = c.get("identity"),
      userId = identity.userId,
      p = await ownedProduct(c.env, userId, c.req.param("id")),
      input = generateRequestSchema.parse(await c.req.json());
    await rateLimit(c, `generate:${userId}`, 15);
    const plan = await createDb(c.env.DB)
      .select()
      .from(shootPlans)
      .where(
        and(
          eq(shootPlans.id, input.planId),
          eq(shootPlans.userId, userId),
          eq(shootPlans.productId, p.id),
        ),
      )
      .get();
    if (!plan) throw notFound();
    if (plan.status !== "approved")
      throw new AppError(
        "PLAN_APPROVAL_REQUIRED",
        "촬영 콘셉트를 먼저 승인해 주세요.",
        409,
      );
    if (input.regenerationOf) {
      const asset = await ownedGenerated(c.env, userId, input.regenerationOf);
      if (asset.productId !== p.id) throw notFound();
    }
    for (const [id, kind] of [
      [input.personReferenceId, "person_reference"],
      [input.lookReferenceId, "look_reference"],
    ] as const) {
      if (!id) continue;
      const reference = await createDb(c.env.DB)
        .select({ id: assets.id })
        .from(assets)
        .where(
          and(
            eq(assets.id, id),
            eq(assets.userId, userId),
            eq(assets.productId, p.id),
            eq(assets.kind, kind),
          ),
        )
        .get();
      if (!reference) throw notFound();
    }
    const sourceIds = await sourceSnapshot(c.env, userId, p.id);
    if (JSON.stringify(sourceIds) !== plan.sourceIdsJson)
      throw new AppError(
        "PLAN_STALE",
        "원본이 변경됐습니다. 다시 기획해 주세요.",
        409,
      );
    const spec = shootPlanSchema.parse(JSON.parse(plan.specJson));
    const analysis = p.analysisJson
      ? productAnalysisSchema.parse(JSON.parse(p.analysisJson))
      : null;
    spec.mustPreserve = [
      ...new Set([
        ...spec.mustPreserve,
        ...(analysis?.preservationPoints ?? []),
      ]),
    ].slice(0, 20);
    const snapshot: GenerationSnapshot = {
      sourceIds,
      analysisSnapshot: analysis ?? undefined,
      preset: null,
      description: "",
      planId: plan.id,
      plan: spec,
      quality: input.quality,
      regenerationOf: input.regenerationOf,
      regenerationReason: input.regenerationReason,
      adjustments: input.adjustments,
      captureVersion: CAPTURE_PROTOCOL_VERSION,
      reviewMode: "manual",
      personReferenceId: input.personReferenceId,
      lookReferenceId: input.lookReferenceId,
      referenceConsent: input.referenceConsent,
      analysisModel: c.env.OPENROUTER_ANALYSIS_MODEL,
      imageModel: identity.isTest
        ? "mock/reference-copy-v1"
        : c.env.OPENROUTER_IMAGE_MODEL,
    };
    // consent is recorded by job.createdAt; the hashed snapshot stays deterministic for retries.
    const job = await insertJob(
      c.env,
      userId,
      p.id,
      "generate",
      input.idempotencyKey,
      snapshot,
    );
    return c.json({ data: await jobDto(c.env, job) }, 202);
  });
  api.get("/products/:id/results", async (c) => {
    const userId = c.get("identity").userId,
      p = await ownedProduct(c.env, userId, c.req.param("id")),
      db = createDb(c.env.DB);
    const images = await db
      .select()
      .from(assets)
      .where(
        and(
          eq(assets.userId, userId),
          eq(assets.productId, p.id),
          eq(assets.kind, "generated"),
        ),
      )
      .orderBy(desc(assets.createdAt))
      .limit(100)
      .all();
    if (!images.length) return c.json({ data: [] });
    const jQueries = images.map((image) =>
      db
        .select()
        .from(jobs)
        .where(and(eq(jobs.id, image.jobId ?? ""), eq(jobs.userId, userId)))
        .limit(1),
    );
    const first = jQueries[0];
    if (!first) return c.json({ data: [] });
    const jobRows = await db.batch([first, ...jQueries.slice(1)]);
    const results: ResultDto[] = [];
    for (const [i, image] of images.entries()) {
      const job = jobRows[i]?.[0];
      const snapshot = job
        ? (JSON.parse(job.requestJson) as GenerationSnapshot)
        : null;
      results.push({
        asset: assetDto(image),
        regenerationOf: snapshot?.regenerationOf ?? null,
        regenerationReason: snapshot?.regenerationReason ?? null,
        adjustments: snapshot?.adjustments ?? "",
        captureVersion: snapshot?.captureVersion ?? null,
        personReferenceUsed: Boolean(snapshot?.personReferenceId),
        lookReferenceUsed: Boolean(snapshot?.lookReferenceId),
        mock: c.get("identity").isTest,
      });
    }
    return c.json({ data: results });
  });
  api.post("/assets/:id/feedback", async (c) => {
    await ownedGenerated(c.env, c.get("identity").userId, c.req.param("id"));
    throw new AppError(
      "FEATURE_RETIRED",
      "점수·피드백 기능은 종료됐습니다. 새로고침 후 원본 비교와 컷 개선을 이용해 주세요.",
      410,
    );
  });
  return api;
}
