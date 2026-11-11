import { Hono, type Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import {
  and,
  connections,
  createDb,
  eq,
  gt,
  invites,
  sessions,
  users,
} from "@photo-studio/db";
import { z } from "zod";
import type { AppContext, Env, Identity } from "./env";
import { challenge, decrypt, encrypt, hash, randomToken } from "./crypto";
import { AppError } from "./errors";

type C = Context<AppContext>;
const week = 7 * 24 * 60 * 60;
const production = (env: Env) => env.APP_ENV === "production";
const sessionName = (env: Env) =>
  production(env) ? "__Host-ps_session" : "ps_session";
const flowName = (env: Env) =>
  production(env) ? "__Host-ps_oauth" : "ps_oauth";
export function webOrigin(env: Env) {
  return new URL(env.ALLOWED_WEB_ORIGINS.split(",")[0] ?? "").origin;
}
export const demoAllowed = (env: Env) =>
  env.APP_ENV === "local" &&
  env.ENABLE_DEMO === "true" &&
  env.AI_MODE === "mock";
function cookieOptions(env: Env, maxAge: number) {
  return {
    httpOnly: true,
    secure: production(env),
    sameSite: "Lax" as const,
    path: "/",
    maxAge,
  };
}
export function requireOrigin(c: C) {
  if (
    !c.env.ALLOWED_WEB_ORIGINS.split(",")
      .map((x) => x.trim())
      .includes(c.req.header("Origin") ?? "")
  )
    throw new AppError("FORBIDDEN", "허용되지 않은 요청입니다.", 403);
}
export async function getIdentity(c: C): Promise<Identity | null> {
  const token = getCookie(c, sessionName(c.env));
  if (!token || token.length > 100) return null;
  const row = await createDb(c.env.DB)
    .select({
      userId: sessions.userId,
      sessionId: sessions.id,
      csrf: sessions.csrf,
      isTest: users.isTest,
      status: users.status,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, await hash(token)),
        gt(sessions.expiresAt, Date.now()),
      ),
    )
    .get();
  return row ?? null;
}
export async function requireIdentity(c: C) {
  const identity = await getIdentity(c);
  if (!identity)
    throw new AppError(
      "UNAUTHENTICATED",
      "스튜디오를 사용하려면 계정을 연결해 주세요.",
      401,
    );
  c.set("identity", identity);
  if (
    identity.status !== "active" &&
    ![
      "/api/v1/account",
      "/api/v1/me",
      "/auth/logout",
      "/auth/refresh",
    ].includes(c.req.path)
  )
    throw new AppError(
      "ACCOUNT_DELETING",
      "계정 삭제를 마무리하려면 계정과 데이터 화면으로 이동해 주세요.",
      409,
    );
  return identity;
}
export function requireCsrf(c: C, identity: Identity) {
  requireOrigin(c);
  if (c.req.header("X-CSRF-Token") !== identity.csrf)
    throw new AppError(
      "FORBIDDEN",
      "페이지를 새로고침한 뒤 다시 시도해 주세요.",
      403,
    );
}
export async function rateLimit(
  c: C,
  action: string,
  limit: number,
  seconds = 600,
) {
  const now = Date.now();
  const key = await hash(
    `${c.env.APP_ENCRYPTION_KEY_B64}:${action}:${c.req.header("CF-Connecting-IP") ?? "local"}:${Math.floor(now / (seconds * 1000))}`,
  );
  const row = await c.env.DB.prepare(
    "INSERT INTO rate_limits (key,hits,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 RETURNING hits",
  )
    .bind(key, now + seconds * 1000)
    .first<{ hits: number }>();
  if (!row || row.hits > limit)
    throw new AppError(
      "RATE_LIMITED",
      "요청이 많습니다. 잠시 후 다시 시도해 주세요.",
      429,
    );
}
export async function issueSession(c: C, userId: string) {
  const token = randomToken();
  const csrf = randomToken();
  await createDb(c.env.DB)
    .insert(sessions)
    .values({
      id: crypto.randomUUID(),
      userId,
      tokenHash: await hash(token),
      csrf,
      createdAt: Date.now(),
      expiresAt: Date.now() + week * 1000,
    });
  setCookie(c, sessionName(c.env), token, cookieOptions(c.env, week));
  return csrf;
}
export interface AuthDeps {
  exchange?: (code: string, verifier: string, env: Env) => Promise<unknown>;
}
const exchangeSchema = z.object({
  key: z.string().min(1).max(1000),
  user_id: z.string().min(1).max(200),
});
export async function exchangeCode(code: string, verifier: string, env: Env) {
  const response = await fetch(`${env.OPENROUTER_BASE_URL}/auth/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      code_verifier: verifier,
      code_challenge_method: "S256",
    }),
    signal: AbortSignal.timeout(15000),
    redirect: "error",
  });
  if (!response.ok)
    throw new AppError(
      "OAUTH_CONNECT_FAILED",
      "OpenRouter 연결을 완료하지 못했습니다.",
      502,
    );
  return response.json();
}
export function authRoutes(deps: AuthDeps = {}) {
  const auth = new Hono<AppContext>();
  auth.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    c.header("Referrer-Policy", "no-referrer");
    await next();
  });
  auth.post("/openrouter/start", async (c) => {
    requireOrigin(c);
    await rateLimit(c, "oauth-start", 10);
    const body = z
      .object({ invite: z.string().trim().max(200).optional() })
      .parse(await c.req.json());
    let inviteId: string | null = null;
    if (body.invite) {
      const row = await createDb(c.env.DB)
        .select()
        .from(invites)
        .where(eq(invites.codeHash, await hash(body.invite)))
        .get();
      if (!row || row.expiresAt <= Date.now() || row.usedCount >= row.maxUses)
        throw new AppError(
          "INVITE_REQUIRED",
          "초대 코드가 유효하지 않거나 사용 기간이 지났습니다.",
          403,
        );
      inviteId = row.id;
    }
    const id = crypto.randomUUID(),
      state = randomToken(),
      browser = randomToken(),
      verifier = randomToken(48);
    const identity = await getIdentity(c);
    await c.env.DB.prepare(
      "INSERT INTO oauth_flows (id,state_hash,browser_hash,verifier_envelope,invite_id,initiating_user_id,expires_at) VALUES (?,?,?,?,?,?,?)",
    )
      .bind(
        id,
        await hash(state),
        await hash(browser),
        await encrypt(verifier, `oauth:${id}`, c.env),
        inviteId,
        identity?.userId ?? null,
        Date.now() + 600000,
      )
      .run();
    setCookie(c, flowName(c.env), browser, cookieOptions(c.env, 600));
    const url = new URL("https://openrouter.ai/auth");
    url.search = new URLSearchParams({
      callback_url: c.env.OPENROUTER_CALLBACK_URL,
      code_challenge: await challenge(verifier),
      code_challenge_method: "S256",
      state,
      key_label: "Photo Studio",
    }).toString();
    return c.json({ data: { url: url.toString() } });
  });
  auth.get("/openrouter/callback", async (c) => {
    const fail = (code: string) =>
      c.redirect(`${webOrigin(c.env)}/beta?error=${code}`, 303);
    const state = c.req.query("state"),
      code = c.req.query("code"),
      browser = getCookie(c, flowName(c.env));
    deleteCookie(c, flowName(c.env), { path: "/", secure: production(c.env) });
    if (!state || state.length > 100 || !code || code.length > 2000 || !browser)
      return fail("OAUTH_STATE_INVALID");
    const flow = await c.env.DB.prepare(
      "DELETE FROM oauth_flows WHERE state_hash=? AND browser_hash=? AND expires_at>? RETURNING *",
    )
      .bind(await hash(state), await hash(browser), Date.now())
      .first<{
        id: string;
        verifier_envelope: string;
        invite_id: string | null;
        initiating_user_id: string | null;
      }>();
    if (!flow) return fail("OAUTH_STATE_INVALID");
    try {
      const raw = await (deps.exchange ?? exchangeCode)(
        code,
        await decrypt(flow.verifier_envelope, `oauth:${flow.id}`, c.env),
        c.env,
      );
      const parsed = exchangeSchema.safeParse(raw);
      if (!parsed.success) return fail("OAUTH_IDENTITY_UNAVAILABLE");
      const provider = parsed.data;
      const db = createDb(c.env.DB);
      let user = await db
        .select()
        .from(users)
        .where(eq(users.externalId, provider.user_id))
        .get();
      if (flow.initiating_user_id && user?.id !== flow.initiating_user_id)
        return fail("OAUTH_ACCOUNT_MISMATCH");
      const userId = user?.id ?? crypto.randomUUID();
      if (user && user.status !== "active") return fail("ACCOUNT_DELETING");
      const envelope = await encrypt(provider.key, `provider:${userId}`, c.env);
      const now = Date.now();
      if (!user) {
        if (!flow.invite_id) return fail("INVITE_REQUIRED");
        // D1 batch is atomic: the invite limit is checked inside the same
        // transaction as user creation, connection and redemption.
        await c.env.DB.batch([
          c.env.DB.prepare(
            "INSERT INTO users (id,openrouter_user_id,is_test,created_at,last_login_at) SELECT ?,?,0,?,? WHERE EXISTS (SELECT 1 FROM invite_codes WHERE id=? AND expires_at>? AND used_count<max_uses)",
          ).bind(userId, provider.user_id, now, now, flow.invite_id, now),
          c.env.DB.prepare(
            "INSERT INTO provider_connections (id,user_id,provider,key_envelope,linked_at) SELECT ?,id,'openrouter',?,? FROM users WHERE id=?",
          ).bind(crypto.randomUUID(), envelope, now, userId),
          c.env.DB.prepare(
            "UPDATE invite_codes SET used_count=used_count+1 WHERE id=? AND EXISTS (SELECT 1 FROM users WHERE id=?)",
          ).bind(flow.invite_id, userId),
          c.env.DB.prepare(
            "INSERT INTO invite_redemptions (id,invite_id,user_id,redeemed_at) SELECT ?,?,id,? FROM users WHERE id=?",
          ).bind(crypto.randomUUID(), flow.invite_id, now, userId),
        ]);
        user = await db.select().from(users).where(eq(users.id, userId)).get();
        if (!user) return fail("INVITE_REQUIRED");
      } else {
        await db
          .insert(connections)
          .values({
            id: crypto.randomUUID(),
            userId,
            provider: "openrouter",
            keyEnvelope: envelope,
            linkedAt: now,
          })
          .onConflictDoUpdate({
            target: [connections.userId, connections.provider],
            set: { keyEnvelope: envelope, linkedAt: now, revokedAt: null },
          });
        await db
          .update(users)
          .set({ lastLoginAt: now })
          .where(eq(users.id, userId));
      }
      await issueSession(c, userId);
      return c.redirect(`${webOrigin(c.env)}/studio`, 303);
    } catch {
      return fail("OAUTH_CONNECT_FAILED");
    }
  });
  auth.post("/demo", async (c) => {
    if (!demoAllowed(c.env))
      throw new AppError("NOT_FOUND", "요청한 기능을 찾을 수 없습니다.", 404);
    requireOrigin(c);
    const userId = crypto.randomUUID(),
      now = Date.now();
    await createDb(c.env.DB)
      .insert(users)
      .values({
        id: userId,
        externalId: `mock:${userId}`,
        isTest: true,
        createdAt: now,
        lastLoginAt: now,
      });
    await createDb(c.env.DB)
      .insert(connections)
      .values({
        id: crypto.randomUUID(),
        userId,
        provider: "mock",
        keyEnvelope: await encrypt(
          "synthetic-mock-credential",
          `provider:${userId}`,
          c.env,
        ),
        linkedAt: now,
      });
    const csrf = await issueSession(c, userId);
    return c.json({ data: { csrf } });
  });
  auth.post("/logout", async (c) => {
    const identity = await requireIdentity(c);
    requireCsrf(c, identity);
    await createDb(c.env.DB)
      .delete(sessions)
      .where(eq(sessions.id, identity.sessionId));
    deleteCookie(c, sessionName(c.env), {
      path: "/",
      secure: production(c.env),
    });
    return c.json({ data: { loggedOut: true } });
  });
  auth.post("/refresh", async (c) => {
    const identity = await requireIdentity(c);
    requireCsrf(c, identity);
    const csrf = await issueSession(c, identity.userId);
    await createDb(c.env.DB)
      .delete(sessions)
      .where(eq(sessions.id, identity.sessionId));
    return c.json({ data: { csrf } });
  });
  auth.post("/disconnect", async (c) => {
    const identity = await requireIdentity(c);
    requireCsrf(c, identity);
    const list = await c.env.DB.prepare(
      "SELECT id FROM products WHERE user_id=?",
    )
      .bind(identity.userId)
      .all<{ id: string }>();
    await (
      await import("./pipeline")
    ).cancelProducts(
      c.env,
      identity.userId,
      list.results.map((p) => p.id),
    );
    await c.env.DB.batch([
      c.env.DB.prepare("DELETE FROM provider_connections WHERE user_id=?").bind(
        identity.userId,
      ),
      c.env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(
        identity.userId,
      ),
    ]);
    deleteCookie(c, sessionName(c.env), {
      path: "/",
      secure: production(c.env),
    });
    return c.json({
      data: { disconnected: true, providerRevocationRequired: true },
    });
  });
  return auth;
}
export async function cleanupIdentity(env: Env) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM oauth_flows WHERE expires_at<?").bind(
      Date.now(),
    ),
    env.DB.prepare("DELETE FROM sessions WHERE expires_at<?").bind(Date.now()),
    env.DB.prepare("DELETE FROM rate_limits WHERE expires_at<?").bind(
      Date.now(),
    ),
  ]);
}
