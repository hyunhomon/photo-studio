import { Hono } from "hono";
import {
  and,
  assets,
  attempts,
  createDb,
  desc,
  eq,
  evaluations,
  feedback,
  jobs,
  shootPlans,
} from "@photo-studio/db";
import {
  type ResultDto,
  type ShootPlan,
  generateRequestSchema,
  feedbackSchema,
  productAnalysisSchema,
  qualitySchema,
  shootPlanSchema,
} from "@photo-studio/schemas";
import { ProviderError, type ProviderUsage } from "@photo-studio/ai";
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
  const db = createDb(env.DB),
    job = await db.select().from(jobs).where(eq(jobs.id, jobId)).get();
  if (!job) return;
  try {
    await jobActive(env, job);
    const input = JSON.parse(job.requestJson) as GenerationSnapshot,
      adapter = await (deps.adapter ?? resolveAdapter)(env, job);
    await adapter.preflight(
      stage === "generation" ? input.imageModel : input.evaluationModel,
      stage,
      input.quality,
    );
    const sources = await imageData(env, job, input.sourceIds);
    if (stage === "generation") {
      await paidStage(env, job, stage, input.imageModel, async () => {
        const result = await adapter.generate(
          input.imageModel,
          sources,
          input.plan,
          input.quality,
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
          "INSERT OR IGNORE INTO assets(id,user_id,product_id,job_id,kind,r2_key,mime_type,size_bytes,width,height,created_at) SELECT ?,j.user_id,j.product_id,j.id,'generated',?,?,?,?,?,? FROM generation_jobs j JOIN products p ON p.id=j.product_id JOIN projects pr ON pr.id=p.project_id WHERE j.id=? AND j.user_id=? AND j.status='running' AND p.status='ready' AND pr.status='active'",
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
    } else {
      const result = await imageData(env, job, [job.id]);
      const evaluation = await paidStage(
        env,
        job,
        stage,
        input.evaluationModel,
        () =>
          adapter.evaluate(
            input.evaluationModel,
            sources,
            result[0] ?? "",
            input.plan.mustPreserve,
          ),
      );
      await db
        .insert(evaluations)
        .values({
          assetId: job.id,
          userId: job.userId,
          specJson: JSON.stringify(qualitySchema.parse(evaluation)),
          createdAt: Date.now(),
        })
        .onConflictDoNothing();
      await db
        .update(jobs)
        .set({
          status: "needs_review",
          stage: "review",
          finishedAt: Date.now(),
        })
        .where(and(eq(jobs.id, job.id), eq(jobs.userId, job.userId)));
    }
  } catch (e) {
    if (stage === "evaluation") {
      await env.DB.prepare(
        "UPDATE generation_jobs SET status='evaluation_failed',error_code=?,stage='review',finished_at=? WHERE id=? AND user_id=? AND status IN ('queued','running')",
      )
        .bind(
          e instanceof ProviderError ? e.code : "EVALUATION_FAILED",
          Date.now(),
          job.id,
          job.userId,
        )
        .run();
    } else await finishFailure(env, job.id, e);
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
      preset: null,
      description: "",
      planId: plan.id,
      plan: spec,
      quality: input.quality,
      regenerationOf: input.regenerationOf,
      regenerationReason: input.regenerationReason,
      analysisModel: c.env.OPENROUTER_ANALYSIS_MODEL,
      imageModel: identity.isTest
        ? "mock/reference-copy-v1"
        : c.env.OPENROUTER_IMAGE_MODEL,
      evaluationModel: identity.isTest
        ? "mock/evaluator-v1"
        : c.env.OPENROUTER_EVALUATION_MODEL,
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
    const qQueries = images.map((image) =>
      db
        .select()
        .from(evaluations)
        .where(
          and(
            eq(evaluations.assetId, image.id),
            eq(evaluations.userId, userId),
          ),
        ),
    );
    const fQueries = images.map((image) =>
      db
        .select()
        .from(feedback)
        .where(and(eq(feedback.assetId, image.id), eq(feedback.userId, userId)))
        .orderBy(desc(feedback.createdAt), desc(feedback.id))
        .limit(1),
    );
    const jQueries = images.map((image) =>
      db
        .select()
        .from(jobs)
        .where(and(eq(jobs.id, image.jobId ?? ""), eq(jobs.userId, userId)))
        .limit(1),
    );
    const qFirst = qQueries[0],
      fFirst = fQueries[0],
      jFirst = jQueries[0];
    if (!qFirst || !fFirst || !jFirst) return c.json({ data: [] });
    const [qualityRows, feedbackRows, jobRows] = await Promise.all([
      db.batch([qFirst, ...qQueries.slice(1)]),
      db.batch([fFirst, ...fQueries.slice(1)]),
      db.batch([jFirst, ...jQueries.slice(1)]),
    ]);
    const results: ResultDto[] = [];
    for (const [i, image] of images.entries()) {
      const q = qualityRows[i]?.[0],
        f = feedbackRows[i]?.[0],
        job = jobRows[i]?.[0];
      const snapshot = job
        ? (JSON.parse(job.requestJson) as GenerationSnapshot)
        : null;
      results.push({
        asset: assetDto(image),
        quality: q ? qualitySchema.parse(JSON.parse(q.specJson)) : null,
        feedback: f
          ? {
              ...feedbackSchema.parse({
                decision: f.decision,
                reason: f.reason,
                note: f.note,
              }),
              createdAt: f.createdAt,
            }
          : null,
        regenerationOf: snapshot?.regenerationOf ?? null,
        regenerationReason: snapshot?.regenerationReason ?? null,
        mock: c.get("identity").isTest,
      });
    }
    return c.json({ data: results });
  });
  api.post("/assets/:id/feedback", async (c) => {
    const userId = c.get("identity").userId,
      asset = await ownedGenerated(c.env, userId, c.req.param("id")),
      input = feedbackSchema.parse(await c.req.json());
    await rateLimit(c, `feedback:${userId}`, 60);
    const row = {
      id: crypto.randomUUID(),
      assetId: asset.id,
      userId,
      ...input,
      createdAt: Date.now(),
    };
    const saved = await c.env.DB.prepare(
      "INSERT INTO feedback(id,asset_id,user_id,decision,reason,note,created_at) SELECT ?,?,?,?,?,?,max(?,coalesce(max(created_at)+1,?)) FROM feedback WHERE asset_id=? AND user_id=? RETURNING created_at",
    )
      .bind(
        row.id,
        row.assetId,
        row.userId,
        row.decision,
        row.reason,
        row.note,
        row.createdAt,
        row.createdAt,
        row.assetId,
        row.userId,
      )
      .first<{ created_at: number }>();
    return c.json(
      { data: { ...input, createdAt: saved?.created_at ?? row.createdAt } },
      201,
    );
  });
  return api;
}
