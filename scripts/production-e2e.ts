import { resolve } from "node:path";
import production from "../infra/production.json";
const root = resolve(import.meta.dir, ".."),
  cli = resolve(root, "apps/api/node_modules/wrangler/bin/wrangler.js"),
  origin = `https://${production.hostname}`;
const identity = (await Bun.file(
  resolve(root, ".wrangler/production/identity.json"),
).json()) as { accountId: string };
const config = (await Bun.file(
  resolve(root, ".wrangler/production/api.json"),
).json()) as { d1_databases: { database_id: string }[] };
const dbId = config.d1_databases[0]?.database_id;
if (!dbId) throw new Error("Production database configuration unavailable");
const authChild = Bun.spawn(["node", cli, "auth", "token", "--json"], {
  stdout: "pipe",
  stderr: "pipe",
});
const authText = await new Response(authChild.stdout).text();
if ((await authChild.exited) !== 0)
  throw new Error("Cloudflare login required");
const { token } = JSON.parse(authText) as { token: string };
async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${identity.accountId}/d1/database/${dbId}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
      signal: AbortSignal.timeout(30000),
    },
  );
  const b = (await r.json()) as {
    success: boolean;
    result: { results: T[]; success: boolean }[];
  };
  if (!r.ok || !b.success || b.result.some((v) => !v.success))
    throw new Error("Production test database operation failed");
  return b.result.flatMap((v) => v.results);
}
async function hash(value: string) {
  const b = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(b)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
const backup = (await Bun.file(
  resolve(root, ".wrangler/production/encryption-key.json"),
).json()) as { key: string; version: string };
async function envelope(userId: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12)),
    key = await crypto.subtle.importKey(
      "raw",
      Uint8Array.from(atob(backup.key), (c) => c.charCodeAt(0)),
      "AES-GCM",
      false,
      ["encrypt"],
    );
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: new TextEncoder().encode(`provider:${userId}`),
    },
    key,
    new TextEncoder().encode("synthetic-mock-credential"),
  );
  return JSON.stringify({
    version: 1,
    kid: backup.version,
    iv: btoa(String.fromCharCode(...iv)),
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
  });
}
const sessions: Record<
  string,
  { token: string; userId: string; csrf: string }
> = {};
let flowHash: string | undefined;
let failure: unknown;
try {
  for (const name of ["desktop-chromium", "mobile-chromium"]) {
    const userId = crypto.randomUUID(),
      sessionToken = crypto.randomUUID() + crypto.randomUUID(),
      csrf = crypto.randomUUID(),
      now = Date.now();
    sessions[name] = { token: sessionToken, userId, csrf };
    await query(
      "INSERT INTO users(id,openrouter_user_id,is_test,created_at,last_login_at) VALUES(?,?,1,?,?)",
      [userId, `mock-production-test:${userId}`, now, now],
    );
    await query(
      "INSERT INTO provider_connections(id,user_id,provider,key_envelope,linked_at) VALUES(?,?,'mock',?,?)",
      [crypto.randomUUID(), userId, await envelope(userId), now],
    );
    await query(
      "INSERT INTO sessions(id,user_id,token_hash,csrf,created_at,expires_at) VALUES(?,?,?,?,?,?)",
      [
        crypto.randomUUID(),
        userId,
        await hash(sessionToken),
        csrf,
        now,
        now + 7200000,
      ],
    );
  }
  const start = await fetch(`${origin}/auth/openrouter/start`, {
    redirect: "manual",
  });
  const authorize = new URL(
    start.headers.get("location") ?? "https://invalid.invalid",
  );
  if (
    start.status !== 303 ||
    authorize.origin !== "https://openrouter.ai" ||
    authorize.searchParams.get("code_challenge_method") !== "S256" ||
    authorize.searchParams.get("callback_url") !==
      `${origin}/auth/openrouter/callback`
  )
    throw new Error("Production PKCE configuration failed");
  const state = authorize.searchParams.get("state");
  if (!state) throw new Error("Missing OAuth state");
  flowHash = await hash(state);
  const cookie = start.headers.get("set-cookie") ?? "";
  if (
    !cookie.includes("__Host-ps_oauth") ||
    !cookie.includes("HttpOnly") ||
    !cookie.includes("Secure")
  )
    throw new Error("OAuth cookie configuration failed");
  const callback = await fetch(
    `${origin}/auth/openrouter/callback?state=${encodeURIComponent(state)}&code=synthetic`,
    { redirect: "manual" },
  );
  if (
    callback.status !== 303 ||
    !callback.headers.get("location")?.includes("OAUTH_STATE_INVALID")
  )
    throw new Error("Callback browser binding failed");
  const child = Bun.spawn(
    ["node", resolve(root, "node_modules/@playwright/test/cli.js"), "test"],
    {
      cwd: root,
      env: {
        ...process.env,
        PHOTO_STUDIO_PRODUCTION_ORIGIN: origin,
        PHOTO_STUDIO_TEST_SESSIONS: JSON.stringify(sessions),
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  let safe = out + err;
  for (const value of [
    token,
    backup.key,
    ...Object.values(sessions).flatMap((s) => [s.token, s.csrf, s.userId]),
  ])
    safe = safe.replaceAll(value, "[redacted]");
  safe = safe.replace(
    /\b[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}\b/gi,
    "[test-id]",
  );
  console.info(safe);
  if (code !== 0) throw new Error("Production browser scenario failed");
} catch (error) {
  failure = error;
}
try {
  for (const session of Object.values(sessions)) {
    const exists = await query<{ n: number }>(
      "SELECT count(*) n FROM users WHERE id=? AND is_test=1",
      [session.userId],
    );
    if (exists[0]?.n) {
      const me = await fetch(`${origin}/api/v1/me`, {
        headers: { Cookie: `__Host-ps_session=${session.token}` },
      });
      if (me.ok) {
        const info = (await me.json()) as { data: { csrf: string } };
        const result = await fetch(`${origin}/api/v1/account`, {
          method: "DELETE",
          headers: {
            Origin: origin,
            Cookie: `__Host-ps_session=${session.token}`,
            "X-CSRF-Token": info.data.csrf,
            "Content-Type": "application/json",
          },
          body: '{"confirm":"DELETE"}',
        });
        if (!result.ok)
          throw new Error(
            "Synthetic test cleanup incomplete; retry before release",
          );
      }
    }
    const remaining = await query<{ n: number }>(
      "SELECT count(*) n FROM users WHERE id=? AND is_test=1",
      [session.userId],
    );
    if (remaining[0]?.n)
      throw new Error("Synthetic test account cleanup incomplete");
  }
  if (flowHash)
    await query("DELETE FROM oauth_flows WHERE state_hash=?", [flowHash]);
} catch (error) {
  failure ??= error;
  console.error("Synthetic test cleanup failed; resolve before release.");
}
if (failure) throw failure;
console.info(
  "PASS: production Mock upload → plan → approval → one image → original/previous comparison → directed revision → export/download → deletion, cross-user isolation and PKCE/browser binding. No paid provider call.",
);
