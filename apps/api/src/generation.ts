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
  completeActiveJob,
  resolveAdapter,
  sourceSnapshot,
} from "./pipeline";
import { clearObjectQueue, deleteObject, queueObject } from "./storage";
import { normalizeImage } from "./images";
import { rateLimit } from "./auth";
import { referenceSource, type ReferenceSource } from "./reference-source";
import {
  getAutomaticReferences,
  assertStockReferenceUsage,
} from "./automatic-reference";

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
  lookReferenceKind?: "automatic_environment" | "automatic_fashion";
  stockReferenceIds?: string[];
  requireNonTraining?: boolean;
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
    if (input.stockReferenceIds?.length)
      await assertStockReferenceUsage(
        env,
        job.userId,
        job.productId,
        input.stockReferenceIds,
      );
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
            lookReferenceKind: input.lookReferenceKind,
            requireNonTraining:
              input.requireNonTraining ||
              Boolean(input.stockReferenceIds?.length),
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
        return {
          value: { assetId: job.id, captureVersion: CAPTURE_PROTOCOL_VERSION },
          usage: result.usage,
        };
      });
    }
    await completeActiveJob(env, job, "needs_review", "review");
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
    const automatic = plan.lookReferenceId
      ? (await getAutomaticReferences(c.env, userId, p.id)).find(
          (item) =>
            item.jobId === plan.id &&
            item.status === "selected" &&
            item.assetId === plan.lookReferenceId,
        )
      : undefined;
    const lookReferenceId =
      input.lookReferenceId ??
      (input.useAutomaticReference ? (automatic?.assetId ?? null) : null);
    const usingAutomatic = Boolean(
      automatic && lookReferenceId === automatic.assetId,
    );
    if (usingAutomatic && !input.useAutomaticReference)
      throw new AppError(
        "AUTO_REFERENCE_DISABLED",
        "자동 참조를 사용하지 않도록 선택했습니다.",
        400,
      );
    let inheritedStockIds: string[] = [];
    if (input.regenerationOf) {
      const asset = await ownedGenerated(c.env, userId, input.regenerationOf);
      if (asset.productId !== p.id) throw notFound();
      const prior =
        asset.jobId &&
        (await createDb(c.env.DB)
          .select()
          .from(jobs)
          .where(
            and(
              eq(jobs.id, asset.jobId),
              eq(jobs.userId, userId),
              eq(jobs.productId, p.id),
            ),
          )
          .get());
      if (prior)
        inheritedStockIds =
          (JSON.parse(prior.requestJson) as GenerationSnapshot)
            .stockReferenceIds ?? [];
    }
    const stockReferenceIds = [
      ...new Set([
        ...inheritedStockIds,
        ...(usingAutomatic && automatic?.provider === "shutterstock"
          ? [automatic.id]
          : []),
      ]),
    ];
    if (stockReferenceIds.length) {
      try {
        await assertStockReferenceUsage(c.env, userId, p.id, stockReferenceIds);
      } catch {
        throw new AppError(
          "SHUTTERSTOCK_POLICY_CHANGED",
          "촬영 참조 사용 계약을 확인해 주세요.",
          409,
        );
      }
    }
    const referenceSources: ReferenceSource[] = [];
    for (const [id, kind] of [
      [input.personReferenceId, "person_reference"],
      [lookReferenceId, "look_reference"],
    ] as const) {
      if (!id) continue;
      const reference = await createDb(c.env.DB)
        .select({
          id: assets.id,
          sourcePinUrl: assets.sourcePinUrl,
          kind: assets.kind,
        })
        .from(assets)
        .where(
          and(
            eq(assets.id, id),
            eq(assets.userId, userId),
            eq(assets.productId, p.id),
          ),
        )
        .get();
      if (!reference) throw notFound();
      if (reference.kind === kind)
        referenceSources.push(
          referenceSource(reference.id, kind, reference.sourcePinUrl),
        );
      else if (
        kind === "look_reference" &&
        reference.kind === "auto_look_reference" &&
        usingAutomatic &&
        automatic
      )
        referenceSources.push({
          assetId: reference.id,
          role: "look_reference",
          discovery:
            automatic.provider === "mock"
              ? "mock_automatic"
              : automatic.provider,
          sourceUrl: automatic.sourcePage,
          creator: automatic.creator,
          license: automatic.license,
          licenseUrl: automatic.licenseUrl,
        });
      else throw notFound();
    }
    const sourceIds = await sourceSnapshot(
      c.env,
      userId,
      p.id,
      JSON.parse(plan.sourceIdsJson) as string[],
    );
    const spec = shootPlanSchema.parse(
      input.editedPlan ?? JSON.parse(plan.specJson),
    );
    const analysis =
      input.editedAnalysis ??
      (p.analysisJson
        ? productAnalysisSchema.parse(JSON.parse(p.analysisJson))
        : null);
    if (!analysis)
      throw new AppError(
        "ANALYSIS_MISSING",
        "상품 분석 후 생성해 주세요.",
        409,
      );
    spec.mustPreserve = [
      ...new Set([
        ...spec.mustPreserve,
        ...(analysis?.preservationPoints ?? []),
      ]),
    ].slice(0, 20);
    // Observations belong to the planning image, not a replacement selected later.
    // Filter only this call's snapshot: keep saved observations and manual edits
    // available for later use with the original planning image.
    const generationSpec = {
      ...spec,
      ...(usingAutomatic && automatic?.provider !== "shutterstock"
        ? {
            camera: {
              ...spec.camera,
              referenceComposition: "inspire" as const,
            },
          }
        : {}),
      referenceNotes:
        lookReferenceId && lookReferenceId === plan.lookReferenceId
          ? spec.referenceNotes
          : "",
    };
    const snapshot: GenerationSnapshot = {
      sourceIds,
      referenceSources,
      analysisSnapshot: analysis ?? undefined,
      preset: null,
      description: "",
      planId: plan.id,
      plan: generationSpec,
      quality: input.quality,
      regenerationOf: input.regenerationOf,
      regenerationReason: input.regenerationReason,
      adjustments: input.adjustments,
      captureVersion: CAPTURE_PROTOCOL_VERSION,
      reviewMode: "manual",
      personReferenceId: input.personReferenceId,
      lookReferenceId,
      referenceConsent: input.referenceConsent || usingAutomatic,
      useAutomaticReference: usingAutomatic,
      ...(stockReferenceIds.length
        ? { stockReferenceIds, requireNonTraining: true }
        : {}),
      ...(usingAutomatic
        ? {
            lookReferenceKind:
              automatic?.provider === "shutterstock"
                ? ("automatic_fashion" as const)
                : ("automatic_environment" as const),
          }
        : {}),
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
      (id) => [
        c.env.DB.prepare(
          "UPDATE products SET analysis_json=?,analysis_version=? WHERE id=? AND user_id=? AND EXISTS(SELECT 1 FROM generation_jobs WHERE id=? AND user_id=?)",
        ).bind(
          JSON.stringify(analysis),
          input.editedAnalysis ? "human-v1" : p.analysisVersion,
          p.id,
          userId,
          id,
          userId,
        ),
        c.env.DB.prepare(
          "UPDATE shoot_plans SET spec_json=?,status='approved' WHERE id=? AND product_id=? AND user_id=? AND EXISTS(SELECT 1 FROM generation_jobs WHERE id=? AND user_id=?)",
        ).bind(JSON.stringify(spec), plan.id, p.id, userId, id, userId),
      ],
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
        .select({
          requestJson: jobs.requestJson,
          outputJson: attempts.outputJson,
        })
        .from(jobs)
        .leftJoin(
          attempts,
          and(
            eq(attempts.jobId, jobs.id),
            eq(attempts.userId, userId),
            eq(attempts.stage, "generation"),
            eq(attempts.status, "succeeded"),
          ),
        )
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
        // The snapshot is the requested version, not proof of which compiler
        // executed a resumed job. Historical attempts without provenance stay unknown.
        captureVersion: recordedCaptureVersion(job?.outputJson),
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

function recordedCaptureVersion(outputJson: string | null | undefined) {
  if (!outputJson) return null;
  try {
    const output: unknown = JSON.parse(outputJson);
    if (
      output &&
      typeof output === "object" &&
      "captureVersion" in output &&
      typeof output.captureVersion === "string"
    )
      return output.captureVersion;
  } catch {
    // Invalid legacy metadata must not invent a version or hide the image.
  }
  return null;
}
