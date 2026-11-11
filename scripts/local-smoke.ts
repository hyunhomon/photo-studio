import { strict as assert } from "node:assert";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseConfigFileTextToJson } from "typescript";

// Isolated workerd integration test. Creates no remote resources, uses no
// credentials, writes only synthetic data and deletes its R2 probe object.
const root = resolve(import.meta.dir, "..");
const apiDir = resolve(root, "apps/api");
const tempDir = resolve(root, ".tmp/local-smoke");
await mkdir(tempDir, { recursive: true });
const parsed = parseConfigFileTextToJson(
  "wrangler.jsonc",
  await readFile(resolve(apiDir, "wrangler.jsonc"), "utf8"),
);
if (parsed.error) throw new Error("Invalid Wrangler JSONC configuration");
const config = parsed.config;
config.main = resolve(apiDir, "test/bindings-worker.ts");
config.name = "photo-studio-local-smoke";
config.d1_databases[0].migrations_dir = resolve(root, "packages/db/migrations");
config.workflows[0].name = "photo-studio-local-smoke";
const configPath = resolve(tempDir, "wrangler.json");
await writeFile(configPath, JSON.stringify(config, null, 2));
const server = Bun.spawn(
  [
    "node",
    resolve(apiDir, "node_modules/wrangler/bin/wrangler.js"),
    "dev",
    "--config",
    configPath,
    "--local",
    "--ip",
    "127.0.0.1",
    "--port",
    "8790",
    "--inspector-port",
    "0",
    "--persist-to",
    resolve(tempDir, "state"),
  ],
  {
    cwd: apiDir,
    stdout: Bun.file(resolve(tempDir, "worker.stdout.log")),
    stderr: Bun.file(resolve(tempDir, "worker.stderr.log")),
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  },
);

const base = "http://127.0.0.1:8790";
const request = (path: string, init?: RequestInit) =>
  fetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(5000) });
async function waitUntil<T>(
  probe: () => Promise<T | false>,
  timeoutMs = 45000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server.exitCode !== null)
      throw new Error("Local smoke Worker exited before test completion");
    const result = await probe();
    if (result !== false) return result;
    await Bun.sleep(250);
  }
  throw new Error(
    "Local smoke timed out; inspect Wrangler local runtime configuration",
  );
}
try {
  await waitUntil(async () => {
    try {
      return (await request("/health")).ok;
    } catch {
      return false;
    }
  });
  const response = await request("/__test/bindings", { method: "POST" });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { d1: true, r2: true });
  const started = await request("/__test/workflow", { method: "POST" });
  assert.equal(started.status, 200);
  const { id } = (await started.json()) as { id: string };
  const completed = await waitUntil(async () => {
    const status = (await (await request(`/__test/workflow/${id}`)).json()) as {
      status: string;
      output?: unknown;
    };
    if (status.status === "errored") throw new Error("Mock Workflow failed");
    return status.status === "complete" ? status : false;
  });
  assert.deepEqual(completed.output, {
    source: "mock",
    stage: "analysis",
    actualCostUsd: null,
  });
  console.info(
    "PASS: workerd /health, Drizzle/D1 SELECT, R2 write/read/delete, durable mock Workflow. No provider calls.",
  );
} finally {
  server.kill();
  await server.exited;
}
