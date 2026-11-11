import { describe, expect, test } from "bun:test";
import { createApp } from "./app";
import { challenge, decrypt, encrypt, hash } from "./crypto";
import { memoryEnv } from "../test/memory";

const origin = "http://localhost:4321";
const cookie = (response: Response) =>
  response.headers.get("set-cookie")?.split(";")[0] ?? "";
async function seedInvite(
  env: ReturnType<typeof memoryEnv>["env"],
  code: string,
  uses = 1,
) {
  await env.DB.prepare(
    "INSERT INTO invite_codes (id,code_hash,max_uses,used_count,expires_at,created_at) VALUES (?,?,?,0,?,?)",
  )
    .bind(
      crypto.randomUUID(),
      await hash(code),
      uses,
      Date.now() + 600000,
      Date.now(),
    )
    .run();
}
async function start(
  app: ReturnType<typeof createApp>,
  env: ReturnType<typeof memoryEnv>["env"],
  invite?: string,
) {
  const response = await app.request(
    "/auth/openrouter/start",
    {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ invite }),
    },
    env,
  );
  return {
    response,
    body: (await response.json()) as { data: { url: string } },
  };
}
describe("PKCE and encryption", () => {
  test("RFC7636 S256 vector and AES-GCM tamper/context/version rejection", async () => {
    expect(await challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
    const { env } = memoryEnv();
    const envelope = await encrypt("synthetic-secret", "user:a", env);
    expect(envelope).not.toContain("synthetic-secret");
    expect(await decrypt(envelope, "user:a", env)).toBe("synthetic-secret");
    await expect(decrypt(envelope, "user:b", env)).rejects.toThrow();
    await expect(
      decrypt(envelope.replace('"v1"', '"v999"'), "user:a", env),
    ).rejects.toThrow();
  });
  test("valid callback creates encrypted connection and separate hashed session, single-use state", async () => {
    const { env, sqlite } = memoryEnv();
    await seedInvite(env, "synthetic-invite");
    let calls = 0;
    const app = createApp({
      exchange: async (_code, verifier) => {
        expect(verifier.length).toBeGreaterThan(43);
        calls++;
        return {
          key: "synthetic-provider-key",
          user_id: "synthetic-external-account",
        };
      },
    });
    const { response, body } = await start(app, env, "synthetic-invite");
    expect(response.status).toBe(200);
    const authorize = new URL(body.data.url);
    expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
    const callback = `/auth/openrouter/callback?code=synthetic-code&state=${authorize.searchParams.get("state")}`;
    const finished = await app.request(
      callback,
      { headers: { Cookie: cookie(response) } },
      env,
    );
    expect(finished.status).toBe(303);
    expect(finished.headers.get("location")).toBe(`${origin}/studio`);
    const cookies = finished.headers.getSetCookie();
    const session =
      cookies.find((value) => value.startsWith("ps_session="))?.split(";")[0] ??
      "";
    expect(session).not.toContain("synthetic-provider-key");
    const me = await app.request(
      "/api/v1/me",
      { headers: { Cookie: session } },
      env,
    );
    const payload = await me.text();
    expect(me.status).toBe(200);
    expect(payload).not.toContain("synthetic-provider-key");
    expect(payload).not.toContain("key_envelope");
    const stored = sqlite
      .query("SELECT key_envelope FROM provider_connections")
      .get() as { key_envelope: string };
    expect(stored.key_envelope).not.toContain("synthetic-provider-key");
    expect(sqlite.query("SELECT used_count FROM invite_codes").get()).toEqual({
      used_count: 1,
    });
    const replay = await app.request(
      callback,
      { headers: { Cookie: cookie(response) } },
      env,
    );
    expect(replay.headers.get("location")).toContain("OAUTH_STATE_INVALID");
    expect(calls).toBe(1);
    const csrf = JSON.parse(payload).data.csrf as string;
    const forbidden = await app.request(
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
    );
    expect(forbidden.status).toBe(403);
    const logout = await app.request(
      "/auth/logout",
      {
        method: "POST",
        headers: { Cookie: session, Origin: origin, "X-CSRF-Token": csrf },
      },
      env,
    );
    expect(logout.status).toBe(200);
    expect(
      (await app.request("/api/v1/me", { headers: { Cookie: session } }, env))
        .status,
    ).toBe(401);
  });
  test("rejects browser mismatch, expired flow, missing identity and exhausted invites", async () => {
    const { env, sqlite } = memoryEnv();
    await seedInvite(env, "synthetic-invite");
    let calls = 0;
    const app = createApp({
      exchange: async () => {
        calls++;
        return { key: "synthetic-key", user_id: null };
      },
    });
    const { response, body } = await start(app, env, "synthetic-invite");
    const state = new URL(body.data.url).searchParams.get("state");
    const path = `/auth/openrouter/callback?code=synthetic-code&state=${state}`;
    const wrong = await app.request(
      path,
      { headers: { Cookie: "ps_oauth=wrong" } },
      env,
    );
    expect(wrong.headers.get("location")).toContain("OAUTH_STATE_INVALID");
    expect(calls).toBe(0);
    const noId = await app.request(
      path,
      { headers: { Cookie: cookie(response) } },
      env,
    );
    expect(noId.headers.get("location")).toContain(
      "OAUTH_IDENTITY_UNAVAILABLE",
    );
    expect(sqlite.query("SELECT count(*) n FROM users").get()).toEqual({
      n: 0,
    });
    const next = await start(app, env);
    sqlite.exec("UPDATE oauth_flows SET expires_at=0");
    const expired = await app.request(
      `/auth/openrouter/callback?code=synthetic&state=${new URL(next.body.data.url).searchParams.get("state")}`,
      { headers: { Cookie: cookie(next.response) } },
      env,
    );
    expect(expired.headers.get("location")).toContain("OAUTH_STATE_INVALID");
    expect(calls).toBe(1);
    sqlite.exec("UPDATE invite_codes SET used_count=max_uses");
    expect((await start(app, env, "synthetic-invite")).response.status).toBe(
      403,
    );
  });
  test("production disables demo, requires secure cookies; invite attempts rate limited", async () => {
    const { env } = memoryEnv();
    const app = createApp();
    for (let n = 0; n < 10; n++) await start(app, env, "invalid");
    expect((await start(app, env, "invalid")).response.status).toBe(429);
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
          "/api/v1/me",
          { headers: { Cookie: "ps_session=forged" } },
          env,
        )
      ).status,
    ).toBe(401);
  });
});
