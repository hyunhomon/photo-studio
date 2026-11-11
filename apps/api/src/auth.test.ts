import { describe, expect, test } from "bun:test";
import { createApp } from "./app";
import { challenge, decrypt, encrypt } from "./crypto";
import { memoryEnv } from "../test/memory";
const origin = "http://localhost:4321";
const flowCookie = (r: Response) =>
  r.headers
    .getSetCookie()
    .find((c) => c.startsWith("ps_oauth="))
    ?.split(";")[0] ?? "";
const sessionCookie = (r: Response) =>
  r.headers
    .getSetCookie()
    .find((c) => c.startsWith("ps_session="))
    ?.split(";")[0] ?? "";
type App = ReturnType<typeof createApp>;
type Env = ReturnType<typeof memoryEnv>["env"];
async function start(app: App, env: Env, method = "POST", cookie = "") {
  const response = await app.request(
    "/auth/openrouter/start",
    {
      method,
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      ...(method === "POST" ? { body: "{}" } : {}),
    },
    env,
  );
  const url =
    method === "GET"
      ? response.headers.get("location")
      : ((await response.json()) as { data: { url: string } }).data.url;
  if (!url) throw new Error("Missing synthetic authorization redirect");
  const authorize = new URL(url);
  return {
    response,
    authorize,
    path: `/auth/openrouter/callback?code=synthetic-code&state=${authorize.searchParams.get("state")}`,
    cookie: flowCookie(response),
  };
}
async function finish(
  app: App,
  env: Env,
  flow: Awaited<ReturnType<typeof start>>,
) {
  return app.request(flow.path, { headers: { Cookie: flow.cookie } }, env);
}
const provider = {
  key: "synthetic-provider-key",
  user_id: "synthetic-external-account",
};
describe("OpenRouter PKCE without invites", () => {
  test("RFC7636 S256 and AES-GCM tamper/context/version rejection", async () => {
    expect(await challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
    const { env } = memoryEnv(),
      value = await encrypt("synthetic-secret", "user:a", env);
    expect(value).not.toContain("synthetic-secret");
    expect(await decrypt(value, "user:a", env)).toBe("synthetic-secret");
    await expect(decrypt(value, "user:b", env)).rejects.toThrow();
    await expect(
      decrypt(value.replace('"v1"', '"v999"'), "user:a", env),
    ).rejects.toThrow();
  });
  test("GET starts OAuth directly; callback creates account without invite, encrypts BYOK and issues separate session", async () => {
    const { env, sqlite } = memoryEnv();
    let calls = 0;
    const app = createApp({
      exchange: async (_code, verifier) => {
        expect(verifier.length).toBeGreaterThan(43);
        calls++;
        return provider;
      },
    });
    const flow = await start(app, env, "GET");
    expect(flow.response.status).toBe(303);
    expect(flow.authorize.origin).toBe("https://openrouter.ai");
    expect(flow.authorize.searchParams.get("code_challenge_method")).toBe(
      "S256",
    );
    const result = await finish(app, env, flow);
    expect(result.headers.get("location")).toBe(`${origin}/studio`);
    const session = sessionCookie(result);
    expect(session).not.toContain(provider.key);
    const me = await app.request(
      "/api/v1/me",
      { headers: { Cookie: session } },
      env,
    );
    expect(me.status).toBe(200);
    const payload = await me.text();
    expect(payload).not.toContain(provider.key);
    expect(payload).not.toContain("key_envelope");
    const stored = sqlite
      .query("SELECT user_id,key_envelope FROM provider_connections")
      .get() as { user_id: string; key_envelope: string };
    expect(stored.key_envelope).not.toContain(provider.key);
    expect(
      await decrypt(stored.key_envelope, `provider:${stored.user_id}`, env),
    ).toBe(provider.key);
    expect(
      sqlite.query("SELECT count(*) n FROM invite_redemptions").get(),
    ).toEqual({ n: 0 });
    expect((await finish(app, env, flow)).headers.get("location")).toContain(
      "OAUTH_STATE_INVALID",
    );
    expect(calls).toBe(1);
    const csrf = (JSON.parse(payload) as { data: { csrf: string } }).data.csrf;
    expect(
      (
        await app.request(
          "/auth/logout",
          {
            method: "POST",
            headers: {
              Cookie: session,
              Origin: "https://untrusted.invalid",
              "X-CSRF-Token": csrf,
            },
          },
          env,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await app.request(
          "/auth/logout",
          {
            method: "POST",
            headers: { Cookie: session, Origin: origin, "X-CSRF-Token": csrf },
          },
          env,
        )
      ).status,
    ).toBe(200);
    expect(
      (await app.request("/api/v1/me", { headers: { Cookie: session } }, env))
        .status,
    ).toBe(401);
  });
  test("browser binding, expiry and missing stable identity fail safely", async () => {
    const { env, sqlite } = memoryEnv();
    let calls = 0;
    const app = createApp({
        exchange: async () => {
          calls++;
          return { key: provider.key, user_id: null };
        },
      }),
      flow = await start(app, env);
    expect(
      (
        await app.request(
          flow.path,
          { headers: { Cookie: "ps_oauth=wrong" } },
          env,
        )
      ).headers.get("location"),
    ).toContain("OAUTH_STATE_INVALID");
    expect(calls).toBe(0);
    expect((await finish(app, env, flow)).headers.get("location")).toContain(
      "OAUTH_IDENTITY_UNAVAILABLE",
    );
    expect(sqlite.query("SELECT count(*) n FROM users").get()).toEqual({
      n: 0,
    });
    const expired = await start(app, env);
    sqlite.exec("UPDATE oauth_flows SET expires_at=0");
    expect((await finish(app, env, expired)).headers.get("location")).toContain(
      "OAUTH_STATE_INVALID",
    );
    expect(calls).toBe(1);
  });
  test("real HTTP exchange contract and classified upstream errors never persist sensitive response text", async () => {
    for (const status of [200, 400, 403, 429, 503]) {
      const { env, sqlite } = memoryEnv();
      let sent = 0;
      const transport = Object.assign(
        async (_input: unknown, init?: RequestInit) => {
          sent++;
          const body = JSON.parse(String(init?.body));
          expect(body.code_challenge_method).toBe("S256");
          expect(body.code_verifier.length).toBeGreaterThan(43);
          return Response.json(
            status === 200
              ? provider
              : {
                  error: {
                    code: status,
                    message: "synthetic-sensitive-provider-message",
                  },
                },
            { status },
          );
        },
        { preconnect: fetch.preconnect },
      ) as typeof fetch;
      const app = createApp({ transport }),
        flow = await start(app, env),
        response = await finish(app, env, flow);
      expect(sent).toBe(1);
      if (status === 200) {
        expect(response.headers.get("location")).toBe(`${origin}/studio`);
      } else {
        expect(response.headers.get("location")).toContain(
          status === 429
            ? "OAUTH_PROVIDER_RATE_LIMITED"
            : status === 503
              ? "OAUTH_PROVIDER_UNAVAILABLE"
              : "OAUTH_CODE_REJECTED",
        );
        const events = JSON.stringify(
          sqlite.query("SELECT stage,code,http_status FROM auth_events").all(),
        );
        expect(events).not.toContain(provider.key);
        expect(events).not.toContain("synthetic-code");
        expect(events).not.toContain("synthetic-sensitive-provider-message");
        expect(events).toContain('"stage":"exchange"');
      }
    }
  });
  test("storage errors roll back account/key together; session failures are distinguished and recoverable", async () => {
    const { env, sqlite } = memoryEnv(),
      app = createApp({ exchange: async () => provider });
    sqlite.exec(
      "CREATE TRIGGER synthetic_key_failure BEFORE INSERT ON provider_connections BEGIN SELECT RAISE(ABORT,'synthetic storage failure'); END",
    );
    expect(
      (await finish(app, env, await start(app, env))).headers.get("location"),
    ).toContain("OAUTH_STORAGE_FAILED");
    expect(sqlite.query("SELECT count(*) n FROM users").get()).toEqual({
      n: 0,
    });
    sqlite.exec("DROP TRIGGER synthetic_key_failure");
    sqlite.exec(
      "CREATE TRIGGER synthetic_session_failure BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT,'synthetic session failure'); END",
    );
    expect(
      (await finish(app, env, await start(app, env))).headers.get("location"),
    ).toContain("OAUTH_SESSION_FAILED");
    sqlite.exec("DROP TRIGGER synthetic_session_failure");
    expect(
      (await finish(app, env, await start(app, env))).headers.get("location"),
    ).toBe(`${origin}/studio`);
    expect(sqlite.query("SELECT count(*) n FROM users").get()).toEqual({
      n: 1,
    });
  });
  test("concurrent first logins reconcile the same stable account without replaying the provider exchange", async () => {
    const { env, sqlite } = memoryEnv();
    let calls = 0;
    const app = createApp({
      exchange: async () => {
        calls++;
        return provider;
      },
    });
    const [a, b] = await Promise.all([start(app, env), start(app, env)]);
    const responses = await Promise.all([
      finish(app, env, a),
      finish(app, env, b),
    ]);
    expect(
      responses.every((r) => r.headers.get("location") === `${origin}/studio`),
    ).toBe(true);
    expect(calls).toBe(2);
    expect(sqlite.query("SELECT count(*) n FROM users").get()).toEqual({
      n: 1,
    });
    expect(
      sqlite.query("SELECT count(*) n FROM provider_connections").get(),
    ).toEqual({ n: 1 });
  });
  test("active app sessions skip OAuth unless reconnecting; another OpenRouter account cannot replace ownership", async () => {
    const { env, sqlite } = memoryEnv();
    let response = provider;
    const app = createApp({ exchange: async () => response }),
      first = await finish(app, env, await start(app, env)),
      session = sessionCookie(first);
    expect(
      (
        await app.request(
          "/auth/openrouter/start",
          { headers: { Cookie: session } },
          env,
        )
      ).headers.get("location"),
    ).toBe(`${origin}/studio`);
    const flow = await start(app, env, "POST", session);
    response = { ...provider, user_id: "synthetic-unrelated-account" };
    expect((await finish(app, env, flow)).headers.get("location")).toContain(
      "OAUTH_ACCOUNT_MISMATCH",
    );
    expect(sqlite.query("SELECT count(*) n FROM users").get()).toEqual({
      n: 1,
    });
  });
  test("rate limits, production secure cookies, explicit Origin and disabled HTTP demo remain enforced", async () => {
    const { env } = memoryEnv(),
      app = createApp();
    for (let i = 0; i < 10; i++) await start(app, env);
    expect(
      (
        await app.request(
          "/auth/openrouter/start",
          { method: "POST", headers: { Origin: origin } },
          env,
        )
      ).status,
    ).toBe(429);
    env.APP_ENV = "production";
    env.ENABLE_DEMO = "true";
    expect(
      (
        await app.request(
          "/auth/demo",
          { method: "POST", headers: { Origin: origin } },
          env,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await app.request(
          "/auth/openrouter/start",
          { method: "POST", headers: { Origin: "https://untrusted.invalid" } },
          env,
        )
      ).status,
    ).toBe(403);
    const p = memoryEnv();
    p.env.APP_ENV = "production";
    const r = await p.env.DB.prepare("SELECT 1").first();
    expect(r).toBeDefined();
    const direct = await app.request("/auth/openrouter/start", {}, p.env);
    const cookie = direct.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("__Host-ps_oauth");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("HttpOnly");
  });
});
