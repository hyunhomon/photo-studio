import { strict as assert } from "node:assert";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { parseConfigFileTextToJson } from "typescript";
import { mockPlan } from "../packages/ai/src/provider";
import { mockAnalysisFixture } from "../packages/ai/src/fixtures";
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
let redirectedRequests = 0,
  exchangeRequests = 0;
const fixture = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === "/auth/keys") {
      exchangeRequests++;
      const body = (await request.json()) as {
        code: string;
        code_verifier: string;
        code_challenge_method: string;
      };
      assert.equal(body.code_challenge_method, "S256");
      assert.ok(body.code_verifier.length >= 43);
      if (body.code === "synthetic-redirect")
        return new Response(null, {
          status: 307,
          headers: { Location: `${fixture.url}redirect-trap` },
        });
      return Response.json({
        key: "synthetic-workerd-provider-key",
        user_id: "synthetic-workerd-account",
      });
    }
    if (path === "/redirect-trap") {
      redirectedRequests++;
      return new Response(null, { status: 500 });
    }
    if (path === "/key") return Response.json({ data: { limit_remaining: 1 } });
    if (path === "/models")
      return Response.json({
        data: [
          {
            id: "synthetic/vision",
            architecture: { input_modalities: ["image", "text"] },
            supported_parameters: ["structured_outputs", "response_format"],
          },
        ],
      });
    if (path === "/images/models")
      return Response.json({
        data: [
          {
            id: "synthetic/image",
            architecture: {
              input_modalities: ["image"],
              output_modalities: ["image"],
            },
            supported_parameters: {
              aspect_ratio: { values: ["3:4"] },
              output_format: { values: ["png"] },
              quality: { values: ["medium"] },
              n: { min: 1, max: 1 },
              input_references: { max: 16 },
            },
          },
        ],
      });
    if (path === "/images")
      return Response.json({
        data: [
          { b64_json: btoa("synthetic-image-bytes"), media_type: "image/png" },
        ],
      });
    if (path === "/chat/completions") {
      const payload = (await request.json()) as {
        response_format: { json_schema: { name: string } };
      };
      const name = payload.response_format.json_schema.name;
      if (!["product_analysis", "shoot_plan"].includes(name))
        return new Response(null, { status: 400 });
      const { aspectRatio: _ratio, ...wirePlan } =
        mockPlan(mockAnalysisFixture);
      const value =
        name === "product_analysis" ? mockAnalysisFixture : wirePlan;
      return Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: `\`\`\`json\n${JSON.stringify(value)}\n\`\`\``,
            },
          },
        ],
      });
    }
    return new Response(null, { status: 404 });
  },
});
config.vars.OPENROUTER_BASE_URL = fixture.url.toString().replace(/\/$/, "");
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
  assert.equal(
    (
      await fetch(`${base}/api/v1/connection/status`, {
        headers: { Cookie: session },
      })
    ).status,
    200,
  );
  const provider = await fetch(`${base}/__test/provider`);
  assert.equal(
    provider.status,
    200,
    "Native workerd provider calls must reach the local fixture",
  );
  assert.equal(((await provider.json()) as { ok: boolean }).ok, true);
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
  const redirectStart = await fetch(`${base}/auth/openrouter/start`, {
    redirect: "manual",
  });
  const redirectState =
    new URL(
      redirectStart.headers.get("location") ?? "https://invalid.invalid",
    ).searchParams.get("state") ?? "";
  const redirectCookie =
    redirectStart.headers
      .getSetCookie()
      .find((c) => c.startsWith("ps_oauth="))
      ?.split(";")[0] ?? "";
  assert.ok(redirectState && redirectCookie);
  const denied = await fetch(
    `${base}/auth/openrouter/callback?code=synthetic-redirect&state=${encodeURIComponent(redirectState)}`,
    { redirect: "manual", headers: { Cookie: redirectCookie } },
  );
  assert.equal(
    new URL(
      denied.headers.get("location") ?? "https://invalid.invalid",
    ).searchParams.get("auth_error"),
    "OAUTH_PROVIDER_UNAVAILABLE",
  );
  assert.equal(exchangeRequests, 2, "No OAuth exchange retries");
  assert.equal(
    redirectedRequests,
    0,
    "Never forward credentials to redirect destinations",
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
    "PASS: native workerd HTTP for OAuth, connection status, model catalogs, analysis/plan/one image; D1 PKCE/session/replay/disconnect; redirects never followed. Local synthetic provider only; no external AI.",
  );
} finally {
  server.kill();
  await server.exited;
  await fixture.stop(true);
}
