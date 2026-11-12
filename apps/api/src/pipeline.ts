import { Hono } from "hono";
import {
  and,
  assets,
  attempts,
  connections,
  createDb,
  desc,
  eq,
  isNull,
  jobs,
  presets,
  products,
  shootPlans,
  users,
} from "@photo-studio/db";
import {
  type JobDto,
  type PipelineDto,
  type PlanDto,
  type PresetInput,
  type ProductAnalysis,
  type AutomaticReferenceDto,
  planRequestSchema,
  presetInputSchema,
  productAnalysisSchema,
  shootPlanSchema,
} from "@photo-studio/schemas";
import {
  InvalidOutputError,
  type ModelAdapter,
  PROMPT_VERSION,
  ProviderError,
  mockAdapter,
  openRouterAdapter,
  type ProviderResult,
} from "@photo-studio/ai";
import { z } from "zod";
import type { AppContext, Env } from "./env";
import { AppError, notFound } from "./errors";
import { ownedProduct } from "./resources";
import { decrypt, hash } from "./crypto";
import { rateLimit } from "./auth";
import { referenceSource, type ReferenceSource } from "./reference-source";
import {
  ensureAutomaticReference,
  getAutomaticReferences,
} from "./automatic-reference";

export type JobRow = typeof jobs.$inferSelect;
export interface PlanSnapshot {
  analysisSnapshot?: ProductAnalysis;
  sourceIds: string[];
  preset: PresetInput | null;
  description: string;
  analysisModel: string;
  imageModel: string;
  lookReferenceId?: string | null;
  personReferenceId?: string | null;
  referenceConsent?: boolean;
  referenceSources?: ReferenceSource[];
  useAutomaticReference?: boolean;
  /** Legacy snapshots only; no evaluator is invoked (ADR-019). */
  evaluationModel?: string;
}
export interface PipelineDeps {
  adapter?: (env: Env, job: JobRow) => Promise<ModelAdapter>;
  automaticReference?: typeof ensureAutomaticReference;
}
export const activeSql = "status IN ('queued','running')";
export async function assertIdle(env: Env, userId: string, productId: string) {
  const active = await env.DB.prepare(
    `SELECT id FROM generation_jobs WHERE user_id=? AND product_id=? AND ${activeSql}`,
  )
    .bind(userId, productId)
    .first();
  if (active)
    throw new AppError(
      "JOB_ACTIVE",
      "진행 중인 작업이 끝난 뒤 변경해 주세요.",
      409,
    );
}
export async function immutableSources(
  env: Env,
  userId: string,
  productId: string,
) {
  const existing = await env.DB.prepare(
    "SELECT id FROM generation_jobs WHERE user_id=? AND product_id=? LIMIT 1",
  )
    .bind(userId, productId)
    .first();
  if (existing)
    throw new AppError(
      "SOURCES_LOCKED",
      "분석에 사용한 원본은 고정됩니다. 사진을 바꾸려면 새 상품으로 등록해 주세요.",
      409,
    );
}
export async function resolveAdapter(
  env: Env,
  job: JobRow,
): Promise<ModelAdapter> {
  const db = createDb(env.DB);
  const user = await db
    .select()
    .from(users)
    .where(eq(users.id, job.userId))
    .get();
  const connection = await db
    .select()
    .from(connections)
    .where(
      and(eq(connections.userId, job.userId), isNull(connections.revokedAt)),
    )
    .get();
  if (!user || !connection) throw new ProviderError("PROVIDER_NOT_CONNECTED");
  if (user.isTest && connection.provider === "mock") return mockAdapter();
  if (env.AI_MODE !== "openrouter" || connection.provider !== "openrouter")
    throw new ProviderError("PROVIDER_NOT_CONFIGURED");
  return openRouterAdapter(
    await decrypt(connection.keyEnvelope, `provider:${job.userId}`, env),
    env.OPENROUTER_BASE_URL,
  );
}
export const planDto = (p: typeof shootPlans.$inferSelect): PlanDto => ({
  id: p.id,
  version: p.version,
  status: p.status,
  spec: shootPlanSchema.parse(JSON.parse(p.specJson)),
  createdAt: p.createdAt,
  lookReferenceId: p.lookReferenceId ?? null,
});
export async function jobDto(env: Env, job: JobRow): Promise<JobDto> {
  const list = await createDb(env.DB)
    .select()
    .from(attempts)
    .where(and(eq(attempts.jobId, job.id), eq(attempts.userId, job.userId)))
    .orderBy(attempts.createdAt)
    .all();
  return jobWithAttempts(job, list);
}
function jobWithAttempts(
  job: JobRow,
  list: (typeof attempts.$inferSelect)[],
): JobDto {
  const snapshot = JSON.parse(job.requestJson) as PlanSnapshot;
  return {
    id: job.id,
    productId: job.productId,
    kind: job.kind,
    status: job.status,
    stage: job.stage,
    errorCode: job.errorCode,
    createdAt: job.createdAt,
    finishedAt: job.finishedAt,
    ...(job.kind === "plan" && snapshot.useAutomaticReference !== undefined
      ? {
          useAutomaticReference:
            snapshot.useAutomaticReference && !snapshot.lookReferenceId,
        }
      : {}),
    attempts: list.map((a) => ({
      stage: a.stage,
      model: a.model,
      status: a.status,
      durationMs: a.durationMs,
      tokensIn: a.tokensIn,
      tokensOut: a.tokensOut,
      actualCostUsd: a.actualCostUsd,
      promptVersion: a.promptVersion,
    })),
  };
}
export async function jobDtos(env: Env, list: JobRow[]): Promise<JobDto[]> {
  const db = createDb(env.DB),
    queries = list.map((j) =>
      db
        .select()
        .from(attempts)
        .where(and(eq(attempts.jobId, j.id), eq(attempts.userId, j.userId)))
        .orderBy(attempts.createdAt),
    );
  const first = queries[0];
  if (!first) return [];
  const rows = await db.batch([first, ...queries.slice(1)]);
  return list.map((j, i) => jobWithAttempts(j, rows[i] ?? []));
}
export async function ownedJob(env: Env, userId: string, id: string) {
  const row = await createDb(env.DB)
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, id), eq(jobs.userId, userId)))
    .get();
  if (!row) throw notFound();
  await ownedProduct(env, userId, row.productId);
  return row;
}
export async function dispatch(env: Env, job: JobRow) {
  try {
    await env.STUDIO_WORKFLOW.create({
      id: job.id,
      params: { kind: job.kind, jobId: job.id },
    });
  } catch {
    // A lost create response may already have started this deterministic instance.
    try {
      const instance = await env.STUDIO_WORKFLOW.get(job.id);
      await instance.status();
    } catch {
      await env.DB.prepare(
        "UPDATE generation_jobs SET error_code='DISPATCH_PENDING' WHERE id=? AND user_id=? AND status='queued'",
      )
        .bind(job.id, job.userId)
        .run();
    }
  }
}
export async function insertJob(
  env: Env,
  userId: string,
  productId: string,
  kind: string,
  idempotencyKey: string,
  snapshot: unknown,
  persist?: (id: string) => D1PreparedStatement[],
) {
  const requestJson = JSON.stringify(snapshot),
    requestHash = await hash(`${productId}:${kind}:${requestJson}`);
  const db = createDb(env.DB);
  const prior = await db
    .select()
    .from(jobs)
    .where(
      and(eq(jobs.userId, userId), eq(jobs.idempotencyKey, idempotencyKey)),
    )
    .get();
  if (prior) {
    if (prior.requestHash !== requestHash)
      throw new AppError(
        "IDEMPOTENCY_CONFLICT",
        "같은 요청 식별자로 다른 작업을 시작할 수 없습니다.",
        409,
      );
    return prior;
  }
  const id = crypto.randomUUID();
  const insertion = env.DB.prepare(
    `INSERT OR IGNORE INTO generation_jobs (id,user_id,product_id,kind,status,stage,idempotency_key,request_hash,request_json,created_at) SELECT ?,?,?,?,'queued','queued',?,?,?,? WHERE EXISTS (SELECT 1 FROM products p JOIN users u ON u.id=p.user_id WHERE p.id=? AND p.user_id=? AND p.status='ready' AND u.status='active') AND NOT EXISTS (SELECT 1 FROM generation_jobs WHERE user_id=? AND product_id=? AND ${activeSql})`,
  ).bind(
    id,
    userId,
    productId,
    kind,
    idempotencyKey,
    requestHash,
    requestJson,
    Date.now(),
    productId,
    userId,
    userId,
    productId,
  );
  await env.DB.batch([insertion, ...(persist?.(id) ?? [])]);
  const row = await db
    .select()
    .from(jobs)
    .where(
      and(eq(jobs.userId, userId), eq(jobs.idempotencyKey, idempotencyKey)),
    )
    .get();
  if (!row)
    throw new AppError("JOB_ACTIVE", "이미 진행 중인 작업이 있습니다.", 409);
  if (row.requestHash !== requestHash)
    throw new AppError(
      "IDEMPOTENCY_CONFLICT",
      "작업 요청이 변경됐습니다.",
      409,
    );
  if (row.id === id) await dispatch(env, row);
  return row;
}
export async function sourceSnapshot(
  env: Env,
  userId: string,
  productId: string,
  plannedIds?: string[],
) {
  const available = await createDb(env.DB)
    .select()
    .from(assets)
    .where(
      and(
        eq(assets.userId, userId),
        eq(assets.productId, productId),
        eq(assets.kind, "input"),
      ),
    )
    .orderBy(assets.createdAt, assets.id)
    .all();
  // Existing plans keep their originals when more photos are appended later.
  const rows = plannedIds
    ? available.filter((row) => plannedIds.includes(row.id))
    : available;
  if (
    plannedIds &&
    JSON.stringify(rows.map((row) => row.id)) !== JSON.stringify(plannedIds)
  )
    throw new AppError(
      "PLAN_STALE",
      "기획에 사용한 원본을 확인할 수 없습니다. 다시 기획해 주세요.",
      409,
    );
  if (!rows.length)
    throw new AppError(
      "SOURCE_REQUIRED",
      "원본 사진을 먼저 등록해 주세요.",
      409,
    );
  if (rows.reduce((n, a) => n + a.sizeBytes, 0) > 12 * 1024 * 1024)
    throw new AppError(
      "SOURCE_TOO_LARGE",
      "AI 입력용 사진의 전체 크기는 12MB 이하여야 합니다. 사진 크기를 줄여 새 상품을 등록해 주세요.",
      409,
    );
  return rows.map((a) => a.id);
}
export async function imageData(env: Env, job: JobRow, ids: string[]) {
  const urls: string[] = [];
  let totalBytes = 0;
  for (const id of ids) {
    const a = await createDb(env.DB)
      .select()
      .from(assets)
      .where(
        and(
          eq(assets.id, id),
          eq(assets.userId, job.userId),
          eq(assets.productId, job.productId),
        ),
      )
      .get();
    if (!a) throw new ProviderError("SOURCE_MISSING");
    totalBytes += a.sizeBytes;
    if (totalBytes > 12 * 1024 * 1024)
      throw new ProviderError("SOURCE_TOO_LARGE");
    const obj = await env.ASSETS.get(a.r2Key);
    if (!obj) throw new ProviderError("SOURCE_MISSING");
    const bytes = new Uint8Array(await obj.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    urls.push(`data:${a.mimeType};base64,${btoa(binary)}`);
  }
  return urls;
}
export async function jobActive(env: Env, job: JobRow) {
  const found = await env.DB.prepare(
    `SELECT j.id FROM generation_jobs j JOIN products p ON p.id=j.product_id AND p.user_id=j.user_id JOIN users u ON u.id=j.user_id WHERE j.id=? AND j.user_id=? AND j.status IN ('queued','running') AND p.status='ready' AND u.status='active'`,
  )
    .bind(job.id, job.userId)
    .first();
  if (!found) throw new ProviderError("JOB_CANCELLED");
}
// Atomic stage claim is the final guard against Workflow replay, response loss and concurrent delivery.
export async function paidStage<T>(
  env: Env,
  job: JobRow,
  stage: string,
  model: string,
  invoke: () => Promise<ProviderResult<T>>,
): Promise<T> {
  await jobActive(env, job);
  const db = createDb(env.DB),
    id = crypto.randomUUID(),
    started = Date.now();
  const claim = await env.DB.prepare(
    "INSERT OR IGNORE INTO generation_attempts(id,user_id,job_id,stage,model,status,request_hash,prompt_version,created_at) VALUES(?,?,?,?,?,'started',?,?,?)",
  )
    .bind(
      id,
      job.userId,
      job.id,
      stage,
      model,
      job.requestHash,
      PROMPT_VERSION,
      started,
    )
    .run();
  if (!claim.meta.changes) {
    const old = await db
      .select()
      .from(attempts)
      .where(
        and(
          eq(attempts.jobId, job.id),
          eq(attempts.stage, stage),
          eq(attempts.userId, job.userId),
        ),
      )
      .get();
    if (old?.status === "succeeded" && old.outputJson)
      return JSON.parse(old.outputJson) as T;
    throw new ProviderError("PROVIDER_OUTCOME_UNKNOWN", true);
  }
  await db
    .update(jobs)
    .set({ status: "running", stage, errorCode: null })
    .where(and(eq(jobs.id, job.id), eq(jobs.userId, job.userId)));
  try {
    const result = await invoke();
    await db
      .update(attempts)
      .set({
        ...result.usage,
        durationMs: Date.now() - started,
        status: "succeeded",
        outputJson: JSON.stringify(result.value),
      })
      .where(and(eq(attempts.id, id), eq(attempts.userId, job.userId)));
    await jobActive(env, job);
    return result.value;
  } catch (error) {
    const unknown =
      !(error instanceof ProviderError) ||
      error.unknownOutcome ||
      error.code === "JOB_CANCELLED";
    await db
      .update(attempts)
      .set({
        status: unknown ? "outcome_unknown" : "failed",
        durationMs: Date.now() - started,
        ...(error instanceof InvalidOutputError
          ? {
              ...error.usage,
              outputJson: JSON.stringify({ validation: error.diagnostic }),
            }
          : {}),
      })
      .where(and(eq(attempts.id, id), eq(attempts.userId, job.userId)));
    throw error instanceof ProviderError
      ? error
      : new ProviderError("PROVIDER_OUTCOME_UNKNOWN", true);
  }
}
export async function finishFailure(env: Env, jobId: string, error: unknown) {
  const code = error instanceof ProviderError ? error.code : "PIPELINE_FAILED";
  const pending = await env.DB.prepare(
    "SELECT id FROM generation_attempts WHERE job_id=? AND status='started' LIMIT 1",
  )
    .bind(jobId)
    .first();
  const uncertain =
    Boolean(pending) ||
    (error instanceof ProviderError && error.unknownOutcome);
  if (uncertain)
    await env.DB.prepare(
      "UPDATE generation_attempts SET status='outcome_unknown' WHERE job_id=? AND status='started'",
    )
      .bind(jobId)
      .run();
  await env.DB.prepare(
    "UPDATE generation_jobs SET status=?,error_code=?,finished_at=? WHERE id=? AND status IN ('queued','running')",
  )
    .bind(
      uncertain ? "outcome_unknown" : "failed",
      uncertain ? "PROVIDER_OUTCOME_UNKNOWN" : code,
      Date.now(),
      jobId,
    )
    .run();
}
export async function reconcileJob(env: Env, job: JobRow) {
  if (
    !["queued", "running"].includes(job.status) ||
    Date.now() - job.createdAt < 600000
  )
    return job;
  try {
    const status = await (await env.STUDIO_WORKFLOW.get(job.id)).status();
    if (["errored", "terminated", "complete"].includes(status.status))
      await finishFailure(
        env,
        job.id,
        new ProviderError("WORKFLOW_INTERRUPTED"),
      );
  } catch {
    /* Control-plane failures never justify another inference. */
  }
  return (
    (await createDb(env.DB)
      .select()
      .from(jobs)
      .where(and(eq(jobs.id, job.id), eq(jobs.userId, job.userId)))
      .get()) ?? job
  );
}
export async function runPlanStage(
  env: Env,
  jobId: string,
  stage: "analysis" | "planning",
  deps: PipelineDeps = {},
) {
  const job = await createDb(env.DB)
    .select()
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .get();
  if (!job) return;
  try {
    await jobActive(env, job);
    const snapshot = JSON.parse(job.requestJson) as PlanSnapshot;
    if (
      (snapshot.lookReferenceId || snapshot.personReferenceId) &&
      !snapshot.referenceConsent
    )
      throw new ProviderError("REFERENCE_CONSENT_REQUIRED");
    if (stage === "analysis" && snapshot.analysisSnapshot) return;
    const adapter = await (deps.adapter ?? resolveAdapter)(env, job);
    await adapter.preflight(snapshot.analysisModel, stage);
    if (stage === "analysis") {
      const images = await imageData(env, job, snapshot.sourceIds);
      const analysis = await paidStage(
        env,
        job,
        stage,
        snapshot.analysisModel,
        () =>
          adapter.analyze(snapshot.analysisModel, images, snapshot.description),
      );
      await createDb(env.DB)
        .update(products)
        .set({
          analysisJson: JSON.stringify(productAnalysisSchema.parse(analysis)),
          analysisVersion: PROMPT_VERSION,
        })
        .where(
          and(eq(products.id, job.productId), eq(products.userId, job.userId)),
        );
      const title =
        analysis.suggestedTitle ||
        [analysis.colors[0], analysis.garmentType].filter(Boolean).join(" ");
      await env.DB.prepare(
        "UPDATE products SET name=? WHERE id=? AND user_id=? AND name_source='auto' AND status='ready'",
      )
        .bind(title.slice(0, 120), job.productId, job.userId)
        .run();
    } else {
      const p = await ownedProduct(env, job.userId, job.productId);
      if (!snapshot.analysisSnapshot && !p.analysisJson)
        throw new ProviderError("ANALYSIS_MISSING");
      const analysis = productAnalysisSchema.parse(
        snapshot.analysisSnapshot ?? JSON.parse(p.analysisJson ?? "null"),
      );
      let lookReferenceId = snapshot.lookReferenceId;
      let automatic: AutomaticReferenceDto | null = null;
      if (!lookReferenceId && snapshot.useAutomaticReference === true) {
        await env.DB.prepare(
          "UPDATE generation_jobs SET status='running',stage='reference_search',error_code=NULL WHERE id=? AND user_id=? AND status IN ('queued','running')",
        )
          .bind(job.id, job.userId)
          .run();
        automatic = await (deps.automaticReference ?? ensureAutomaticReference)(
          env,
          job,
          analysis,
        );
        if (automatic.status !== "selected" || !automatic.assetId)
          throw new ProviderError(
            automatic.failureCode ?? "AUTO_REFERENCE_NOT_FOUND",
          );
        lookReferenceId = automatic.assetId;
      }
      const selectedIds = [
        ...snapshot.sourceIds,
        ...(lookReferenceId ? [lookReferenceId] : []),
        ...(snapshot.personReferenceId ? [snapshot.personReferenceId] : []),
      ];
      const inputSize = await env.DB.prepare(
        `SELECT coalesce(sum(size_bytes),0) n FROM assets WHERE user_id=? AND product_id=? AND id IN (${selectedIds.map(() => "?").join(",")})`,
      )
        .bind(job.userId, job.productId, ...selectedIds)
        .first<{ n: number }>();
      if ((inputSize?.n ?? 0) > 12 * 1024 * 1024)
        throw new ProviderError("SOURCE_TOO_LARGE");
      const lookImage = lookReferenceId
        ? (await imageData(env, job, [lookReferenceId]))[0]
        : undefined;
      const personImage = snapshot.personReferenceId
        ? (await imageData(env, job, [snapshot.personReferenceId]))[0]
        : undefined;
      const plan = await paidStage(
        env,
        job,
        stage,
        snapshot.analysisModel,
        () =>
          adapter.plan(
            snapshot.analysisModel,
            analysis,
            snapshot.preset,
            automatic
              ? `${snapshot.description}\nAutomatic environment reference: use observed lighting, material response and focus cues only. Do not copy the architecture-only crop, absence of people, or a reference person's identity. Preserve the approved adult, garment evidence and requested framing/angle.`
              : snapshot.description,
            {
              lookImage,
              personImage,
              ...(automatic
                ? { lookReferenceKind: "automatic_environment" as const }
                : {}),
            },
          ),
      );
      if (automatic) plan.camera.referenceComposition = "inspire";
      const versions = await env.DB.prepare(
        "SELECT coalesce(max(version),0)+1 n FROM shoot_plans WHERE product_id=? AND user_id=?",
      )
        .bind(job.productId, job.userId)
        .first<{ n: number }>();
      await createDb(env.DB)
        .insert(shootPlans)
        .values({
          id: job.id,
          userId: job.userId,
          productId: job.productId,
          version: versions?.n ?? 1,
          status: "draft",
          specJson: JSON.stringify(shootPlanSchema.parse(plan)),
          sourceIdsJson: JSON.stringify(snapshot.sourceIds),
          lookReferenceId: lookReferenceId ?? null,
          createdAt: Date.now(),
        })
        .onConflictDoNothing();
      await createDb(env.DB)
        .update(jobs)
        .set({
          status: "completed",
          stage: "review_plan",
          finishedAt: Date.now(),
        })
        .where(and(eq(jobs.id, job.id), eq(jobs.userId, job.userId)));
    }
  } catch (e) {
    await finishFailure(env, job.id, e);
  }
}
export async function cancelProducts(env: Env, userId: string, ids: string[]) {
  if (!ids.length) return;
  const owned = new Set(ids),
    rows = await env.DB.prepare(
      "SELECT id,product_id FROM generation_jobs WHERE user_id=? AND status IN ('queued','running')",
    )
      .bind(userId)
      .all<{ id: string; product_id: string }>();
  const list = rows.results.filter((j) => owned.has(j.product_id));
  if (list.length)
    await env.DB.batch(
      list.flatMap((j) => [
        env.DB.prepare(
          "UPDATE generation_jobs SET status='cancelled',finished_at=? WHERE id=? AND user_id=? AND status IN ('queued','running')",
        ).bind(Date.now(), j.id, userId),
        env.DB.prepare(
          "UPDATE generation_attempts SET status='outcome_unknown' WHERE job_id=? AND user_id=? AND status='started'",
        ).bind(j.id, userId),
      ]),
    );
  // DB cancellation prevents every later paid stage. Bound best-effort control-plane calls per request.
  for (const j of list.slice(0, 10)) {
    try {
      await (await env.STUDIO_WORKFLOW.get(j.id)).terminate();
    } catch {
      /* DB state remains authoritative. */
    }
  }
}
export function pipelineRoutes() {
  const api = new Hono<AppContext>();
  api.get("/products/:id/pipeline", async (c) => {
    const userId = c.get("identity").userId,
      p = await ownedProduct(c.env, userId, c.req.param("id"));
    const db = createDb(c.env.DB),
      plans = await db
        .select()
        .from(shootPlans)
        .where(
          and(eq(shootPlans.productId, p.id), eq(shootPlans.userId, userId)),
        )
        .orderBy(desc(shootPlans.version))
        .limit(100)
        .all();
    const list = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.productId, p.id), eq(jobs.userId, userId)))
      .orderBy(desc(jobs.createdAt))
      .limit(100)
      .all();
    return c.json({
      data: {
        plans: plans.map(planDto),
        jobs: await jobDtos(
          c.env,
          await Promise.all(list.map((j) => reconcileJob(c.env, j))),
        ),
        retrievals: await getAutomaticReferences(c.env, userId, p.id),
      },
    } satisfies { data: PipelineDto });
  });
  api.post("/products/:id/plan", async (c) => {
    const userId = c.get("identity").userId,
      p = await ownedProduct(c.env, userId, c.req.param("id"));
    const input = planRequestSchema.parse(await c.req.json());
    if (input.reuseAnalysis && !p.analysisJson)
      throw new AppError(
        "ANALYSIS_MISSING",
        "먼저 상품 분석을 완료해 주세요.",
        409,
      );
    await rateLimit(c, `analysis:${userId}`, 20);
    const referenceSources: ReferenceSource[] = [];
    for (const [id, kind] of [
      [input.lookReferenceId, "look_reference"],
      [input.personReferenceId, "person_reference"],
    ] as const) {
      if (!id) continue;
      const reference = await createDb(c.env.DB)
        .select({ id: assets.id, sourcePinUrl: assets.sourcePinUrl })
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
      referenceSources.push(
        referenceSource(reference.id, kind, reference.sourcePinUrl),
      );
    }
    const total = await c.env.DB.prepare(
      "SELECT coalesce(sum(size_bytes),0) n FROM assets WHERE user_id=? AND product_id=? AND (kind='input' OR id=? OR id=?)",
    )
      .bind(
        userId,
        p.id,
        input.lookReferenceId ?? "",
        input.personReferenceId ?? "",
      )
      .first<{ n: number }>();
    if ((total?.n ?? 0) > 12 * 1024 * 1024)
      throw new AppError(
        "SOURCE_TOO_LARGE",
        "사진 합계는 12MB 이하여야 합니다. AI는 호출하지 않았습니다.",
        409,
      );
    let preset: PresetInput | null = null;
    if (input.presetId) {
      const row = await createDb(c.env.DB)
        .select()
        .from(presets)
        .where(and(eq(presets.id, input.presetId), eq(presets.userId, userId)))
        .get();
      if (!row) throw notFound();
      preset = presetInputSchema.parse(JSON.parse(row.specJson));
    }
    const snapshot: PlanSnapshot = {
      ...(input.reuseAnalysis
        ? {
            analysisSnapshot: productAnalysisSchema.parse(
              input.editedAnalysis ?? JSON.parse(p.analysisJson ?? "null"),
            ),
          }
        : {}),
      sourceIds: await sourceSnapshot(c.env, userId, p.id),
      useAutomaticReference: input.useAutomaticReference,
      referenceSources,
      preset,
      description: input.description,
      lookReferenceId: input.lookReferenceId,
      personReferenceId: input.personReferenceId,
      referenceConsent: input.referenceConsent,
      analysisModel: c.get("identity").isTest
        ? "mock/analyzer-planner-v1"
        : c.env.OPENROUTER_ANALYSIS_MODEL,
      imageModel: c.env.OPENROUTER_IMAGE_MODEL,
    };
    const job = await insertJob(
      c.env,
      userId,
      p.id,
      "plan",
      input.idempotencyKey,
      snapshot,
    );
    return c.json({ data: await jobDto(c.env, job) }, 202);
  });
  api.patch("/products/:id/analysis", async (c) => {
    const userId = c.get("identity").userId,
      p = await ownedProduct(c.env, userId, c.req.param("id"));
    await assertIdle(c.env, userId, p.id);
    const value = productAnalysisSchema.parse(await c.req.json());
    await createDb(c.env.DB)
      .update(products)
      .set({ analysisJson: JSON.stringify(value), analysisVersion: "human-v1" })
      .where(and(eq(products.id, p.id), eq(products.userId, userId)));
    await createDb(c.env.DB)
      .update(shootPlans)
      .set({ status: "draft" })
      .where(
        and(eq(shootPlans.productId, p.id), eq(shootPlans.userId, userId)),
      );
    return c.json({ data: value });
  });
  api.patch("/plans/:id", async (c) => {
    const userId = c.get("identity").userId,
      db = createDb(c.env.DB);
    const p = await db
      .select()
      .from(shootPlans)
      .where(
        and(
          eq(shootPlans.id, c.req.param("id")),
          eq(shootPlans.userId, userId),
        ),
      )
      .get();
    if (!p) throw notFound();
    await ownedProduct(c.env, userId, p.productId);
    await assertIdle(c.env, userId, p.productId);
    const input = z
      .object({ spec: shootPlanSchema, approved: z.boolean() })
      .strict()
      .parse(await c.req.json());
    const row = {
      ...p,
      specJson: JSON.stringify(input.spec),
      status: input.approved ? "approved" : "draft",
    };
    await db
      .update(shootPlans)
      .set({ specJson: row.specJson, status: row.status })
      .where(and(eq(shootPlans.id, p.id), eq(shootPlans.userId, userId)));
    return c.json({ data: planDto(row) });
  });
  api.get("/jobs/:id", async (c) =>
    c.json({
      data: await jobDto(
        c.env,
        await ownedJob(c.env, c.get("identity").userId, c.req.param("id")),
      ),
    }),
  );
  api.post("/jobs/:id/dispatch", async (c) => {
    const job = await ownedJob(
      c.env,
      c.get("identity").userId,
      c.req.param("id"),
    );
    if (job.status === "queued") await dispatch(c.env, job);
    return c.json({ data: await jobDto(c.env, job) });
  });
  return api;
}
