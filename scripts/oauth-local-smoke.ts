import { strict as assert } from "node:assert";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { parseConfigFileTextToJson } from "typescript";
const root = resolve(import.meta.dir, ".."),
  temp = resolve(root, ".tmp/oauth-local-smoke"),
  cli = resolve(root, "apps/api/node_modules/wrangler/bin/wrangler.js"),
  state = resolve(temp, "state"),
  configPath = resolve(temp, "wrangler.json");
await mkdir(temp, { recursive: true });
const parsed = parseConfigFileTextToJson(
  "wrangler.jsonc",
  await Bun.file(resolve(root, "apps/api/wrangler.jsonc")).text(),
);
if (parsed.error) throw new Error("Invalid local configuration");
const config = parsed.config;
config.name = "photo-studio-oauth-local-smoke";
config.main = resolve(root, "apps/api/test/oauth-worker.ts");
delete config.workflows;
delete config.triggers;
config.d1_databases[0].migrations_dir = resolve(root, "packages/db/migrations");
config.vars.APP_ENCRYPTION_KEY_B64 = btoa(
  String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
);
await Bun.write(configPath, JSON.stringify(config));
const migration = Bun.spawn(
  [
    "node",
    cli,
    "d1",
    "migrations",
    "apply",
    config.d1_databases[0].database_name,
    "--local",
    "--config",
    configPath,
    "--persist-to",
    state,
  ],
  {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  },
);
await Promise.all([
  new Response(migration.stdout).text(),
  new Response(migration.stderr).text(),
]);
if (await migration.exited) throw new Error("Isolated OAuth migrations failed");
const server = Bun.spawn(
  [
    "node",
    cli,
    "dev",
    "--config",
    configPath,
    "--local",
    "--ip",
    "127.0.0.1",
    "--port",
    "8791",
    "--inspector-port",
    "0",
    "--persist-to",
    state,
    "--log-level",
    "error",
  ],
  {
    cwd: root,
    stdout: Bun.file(resolve(temp, "worker.stdout.log")),
    stderr: Bun.file(resolve(temp, "worker.stderr.log")),
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  },
);
const base = "http://127.0.0.1:8791";
try {
  const deadline = Date.now() + 45000;
  let ready = false;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${base}/health`)).ok) {
        ready = true;
        break;
      }
    } catch {}
    if (server.exitCode !== null)
      throw new Error("OAuth workerd failed to start");
    await Bun.sleep(200);
  }
  if (!ready) throw new Error("OAuth workerd startup timed out");
  const start = await fetch(`${base}/auth/openrouter/start`, {
    redirect: "manual",
  });
  assert.equal(start.status, 303);
  const authorize = new URL(
    start.headers.get("location") ?? "https://invalid.invalid",
  );
  assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");
  const cookie =
    start.headers
      .getSetCookie()
      .find((c) => c.startsWith("ps_oauth="))
      ?.split(";")[0] ?? "";
  const path = `${base}/auth/openrouter/callback?code=synthetic-code&state=${encodeURIComponent(authorize.searchParams.get("state") ?? "")}`;
  const callback = await fetch(path, {
    redirect: "manual",
    headers: { Cookie: cookie },
  });
  assert.equal(callback.status, 303);
  const location = callback.headers.get("location");
  if (location !== "http://localhost:4321/studio")
    throw new Error(
      `OAuth workerd callback failed: ${new URL(location ?? "https://invalid.invalid").searchParams.get("auth_error") ?? "unexpected redirect"}`,
    );
  const session =
    callback.headers
      .getSetCookie()
      .find((c) => c.startsWith("ps_session="))
      ?.split(";")[0] ?? "";
  const me = await fetch(`${base}/api/v1/me`, { headers: { Cookie: session } });
  assert.equal(me.status, 200);
  const json = (await me.json()) as { data: { csrf: string; mode: string } };
  assert.equal(json.data.mode, "openrouter");
  const again = await fetch(path, {
    redirect: "manual",
    headers: { Cookie: cookie },
  });
  assert.equal(
    new URL(
      again.headers.get("location") ?? "https://invalid.invalid",
    ).searchParams.get("auth_error"),
    "OAUTH_STATE_INVALID",
  );
  const disconnected = await fetch(`${base}/auth/disconnect`, {
    method: "POST",
    headers: {
      Cookie: session,
      Origin: "http://localhost:4321",
      "X-CSRF-Token": json.data.csrf,
    },
  });
  assert.equal(disconnected.status, 200);
  assert.equal(
    (await fetch(`${base}/api/v1/me`, { headers: { Cookie: session } })).status,
    401,
  );
  console.info(
    "PASS: real workerd/D1 PKCE verifier decrypt, no-invite callback, encrypted connection/session, single-use state and disconnect. Only fake provider exchange; no external AI.",
  );
} finally {
  server.kill();
  await server.exited;
}
