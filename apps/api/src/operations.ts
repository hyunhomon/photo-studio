import { Hono } from "hono";
import { deleteCookie } from "hono/cookie";
import { z } from "zod";
import {
  and,
  assets,
  attempts,
  createDb,
  eq,
  desc,
  jobs,
  products,
  projects,
  shootPlans,
  presets,
  evaluations,
  feedback,
  users,
} from "@photo-studio/db";
import type { UsageDto } from "@photo-studio/schemas";
import type { AppContext } from "./env";
import { cancelProducts, jobDtos } from "./pipeline";
import { deleteObjects, purgeUserMedia } from "./storage";
import { AppError } from "./errors";
import { rateLimit } from "./auth";
export function operationsRoutes() {
  const api = new Hono<AppContext>();
  api.get("/usage", async (c) => {
    const userId = c.get("identity").userId;
    const calls = await c.env.DB.prepare(
      "SELECT count(*) calls,count(actual_cost_usd) known,coalesce(sum(actual_cost_usd),0) cost,avg(duration_ms) latency,sum(CASE WHEN status='outcome_unknown' THEN 1 ELSE 0 END) uncertain FROM generation_attempts WHERE user_id=?",
    )
      .bind(userId)
      .first<{
        calls: number;
        known: number;
        cost: number;
        latency: number | null;
        uncertain: number | null;
      }>();
    const image = await c.env.DB.prepare(
      "SELECT count(*) generated FROM assets WHERE user_id=? AND kind='generated'",
    )
      .bind(userId)
      .first<{ generated: number }>();
    const regenerated = await c.env.DB.prepare(
      "SELECT count(*) n FROM generation_jobs WHERE user_id=? AND kind='generate' AND json_extract(request_json,'$.regenerationOf') IS NOT NULL",
    )
      .bind(userId)
      .first<{ n: number }>();
    const stage = await c.env.DB.prepare(
      "SELECT stage,count(*) calls,coalesce(sum(actual_cost_usd),0) reportedCostUsd,count(actual_cost_usd) known,avg(duration_ms) averageLatencyMs FROM generation_attempts WHERE user_id=? GROUP BY stage",
    )
      .bind(userId)
      .all<UsageDto["stages"][number]>();
    const list = await createDb(c.env.DB)
      .select()
      .from(jobs)
      .where(eq(jobs.userId, userId))
      .orderBy(desc(jobs.createdAt))
      .limit(50)
      .all();
    const data: UsageDto = {
      mock: c.get("identity").isTest,
      calls: calls?.calls ?? 0,
      knownCostCount: calls?.known ?? 0,
      unknownCostCount: (calls?.calls ?? 0) - (calls?.known ?? 0),
      reportedCostUsd: calls?.cost ?? 0,
      averageLatencyMs: calls?.latency ?? null,
      generated: image?.generated ?? 0,
      unknownOutcomes: calls?.uncertain ?? 0,
      regenerations: regenerated?.n ?? 0,
      history: await jobDtos(c.env, list),
      stages: stage.results,
    };
    return c.json({ data });
  });
  api.get("/account/export", async (c) => {
    const userId = c.get("identity").userId;
    await rateLimit(c, `export:${userId}`, 5);
    const db = createDb(c.env.DB);
    // Deliberately no sessions, encrypted credentials, external identity, OAuth flows or object keys.
    const account = await db
      .select({ createdAt: users.createdAt, isTest: users.isTest })
      .from(users)
      .where(eq(users.id, userId))
      .get();
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      account,
      projects: await db
        .select({
          id: projects.id,
          name: projects.name,
          description: projects.description,
          createdAt: projects.createdAt,
        })
        .from(projects)
        .where(eq(projects.userId, userId))
        .all(),
      products: await db
        .select({
          id: products.id,
          projectId: products.projectId,
          name: products.name,
          analysisJson: products.analysisJson,
          createdAt: products.createdAt,
        })
        .from(products)
        .where(eq(products.userId, userId))
        .all(),
      assets: await db
        .select({
          id: assets.id,
          productId: assets.productId,
          kind: assets.kind,
          width: assets.width,
          height: assets.height,
          mimeType: assets.mimeType,
          createdAt: assets.createdAt,
        })
        .from(assets)
        .where(eq(assets.userId, userId))
        .all(),
      plans: await db
        .select({
          id: shootPlans.id,
          productId: shootPlans.productId,
          status: shootPlans.status,
          specJson: shootPlans.specJson,
          version: shootPlans.version,
        })
        .from(shootPlans)
        .where(eq(shootPlans.userId, userId))
        .all(),
      presets: await db
        .select({ id: presets.id, specJson: presets.specJson })
        .from(presets)
        .where(eq(presets.userId, userId))
        .all(),
      jobs: await db
        .select({
          id: jobs.id,
          productId: jobs.productId,
          kind: jobs.kind,
          status: jobs.status,
          stage: jobs.stage,
          requestJson: jobs.requestJson,
          errorCode: jobs.errorCode,
          createdAt: jobs.createdAt,
          finishedAt: jobs.finishedAt,
        })
        .from(jobs)
        .where(eq(jobs.userId, userId))
        .all(),
      attempts: await db
        .select({
          jobId: attempts.jobId,
          stage: attempts.stage,
          model: attempts.model,
          status: attempts.status,
          promptVersion: attempts.promptVersion,
          durationMs: attempts.durationMs,
          tokensIn: attempts.tokensIn,
          tokensOut: attempts.tokensOut,
          actualCostUsd: attempts.actualCostUsd,
          estimatedCostUsd: attempts.estimatedCostUsd,
        })
        .from(attempts)
        .where(eq(attempts.userId, userId))
        .all(),
      evaluations: await db
        .select({
          assetId: evaluations.assetId,
          specJson: evaluations.specJson,
        })
        .from(evaluations)
        .where(eq(evaluations.userId, userId))
        .all(),
      feedback: await db
        .select({
          assetId: feedback.assetId,
          decision: feedback.decision,
          reason: feedback.reason,
          note: feedback.note,
          createdAt: feedback.createdAt,
        })
        .from(feedback)
        .where(eq(feedback.userId, userId))
        .all(),
    };
    return new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="photo-studio-data.json"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
  api.delete("/account", async (c) => {
    const userId = c.get("identity").userId;
    z.object({ confirm: z.literal("DELETE") })
      .strict()
      .parse(await c.req.json());
    await c.env.DB.batch([
      c.env.DB.prepare(
        "INSERT INTO media_purges(user_id,created_at) VALUES(?,?) ON CONFLICT(user_id) DO NOTHING",
      ).bind(userId, Date.now()),
      c.env.DB.prepare("UPDATE users SET status='deleting' WHERE id=?").bind(
        userId,
      ),
      c.env.DB.prepare(
        "UPDATE projects SET status='deleting' WHERE user_id=?",
      ).bind(userId),
    ]);
    const productIds = await createDb(c.env.DB)
      .select({ id: products.id })
      .from(products)
      .where(eq(products.userId, userId))
      .all();
    const objects = await createDb(c.env.DB)
      .select({ key: assets.r2Key })
      .from(assets)
      .where(eq(assets.userId, userId))
      .all();
    try {
      await cancelProducts(
        c.env,
        userId,
        productIds.map((p) => p.id),
      );
      const pending = await c.env.DB.prepare(
        "SELECT key FROM storage_cleanup WHERE key LIKE ?",
      )
        .bind(`${userId}/%`)
        .all<{ key: string }>();
      await deleteObjects(c.env, [
        ...objects.map((o) => o.key),
        ...pending.results.map((o) => o.key),
      ]);
      await purgeUserMedia(c.env, userId);
    } catch {
      throw new AppError(
        "ACCOUNT_CLEANUP_PENDING",
        "사진 삭제를 마무리하지 못했습니다. 계정 삭제를 다시 실행해 주세요. 삭제 중에는 새 작업을 시작할 수 없습니다.",
        503,
      );
    }
    await createDb(c.env.DB)
      .delete(users)
      .where(and(eq(users.id, userId), eq(users.status, "deleting")));
    deleteCookie(
      c,
      c.env.APP_ENV === "production" ? "__Host-ps_session" : "ps_session",
      { path: "/", secure: c.env.APP_ENV === "production" },
    );
    return c.json({
      data: { deleted: true, providerRevocationRequired: true },
    });
  });
  return api;
}
