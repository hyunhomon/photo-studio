import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { relative, resolve, sep } from "node:path";
import { parseConfigFileTextToJson } from "typescript";
import production from "../infra/production.json";
import { captureAuth, verifyAuth } from "./auth-preservation";

// The only remote environment is production. Local Wrangler files remain
// offline development configuration. Account/zone/database identifiers stay
// in ignored generated files, and the OAuth token exists only in memory.
const root = resolve(import.meta.dir, "..");
const stateDir = resolve(root, ".wrangler/production");
const cli = resolve(root, "apps/api/node_modules/wrangler/bin/wrangler.js");
const origin = `https://${production.hostname}`;
let token = "";
let accountId = "";

function redact(value: string) {
  return value
    .replaceAll(token || "__no_token__", "[redacted]")
    .replace(/\b[a-f\d]{32}\b/gi, "[resource-id]")
    .replace(/\b[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}\b/gi, "[resource-id]");
}

async function run(
  label: string,
  args: string[],
  options: {
    cwd?: string;
    env?: Record<string, string>;
    privateOutput?: boolean;
    input?: string;
  } = {},
) {
  const child = Bun.spawn(args, {
    cwd: options.cwd ?? root,
    env: {
      ...process.env,
      WRANGLER_SEND_METRICS: "false",
      CLOUDFLARE_ACCOUNT_ID: accountId || undefined,
      ...options.env,
    },
    stdout: "pipe",
    stderr: "pipe",
    stdin: "pipe",
  });
  child.stdin.write(options.input ?? "");
  child.stdin.end();
  const [out, error, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) {
    if (!options.privateOutput) console.error(redact(out + error));
    throw new Error(`${label} failed (exit ${code}).`);
  }
  return out;
}

interface Envelope<T> {
  success: boolean;
  result: T;
  errors?: { code: number }[];
}
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    signal: AbortSignal.timeout(30000),
  });
  const body = (await response.json()) as Envelope<T>;
  if (!response.ok || body.success === false) {
    // No URLs (which carry identifiers), upstream dumps, or credentials.
    throw new Error(
      `Cloudflare API failed: HTTP ${response.status}; codes ${body.errors?.map((e) => e.code).join(",") ?? "unknown"}.`,
    );
  }
  return body.result;
}

async function readConfig(path: string) {
  const parsed = parseConfigFileTextToJson(
    path,
    await readFile(resolve(root, path), "utf8"),
  );
  if (parsed.error)
    throw new Error("Invalid local Wrangler JSONC configuration.");
  return parsed.config;
}

console.info(
  "Production deployment: Cloudflare infrastructure usage applies; BYOK inference requires explicit user consent.",
);
const who = JSON.parse(
  await run("Wrangler login check", ["node", cli, "whoami", "--json"], {
    privateOutput: true,
  }),
) as { accounts: { id: string }[] };
const auth = JSON.parse(
  await run(
    "Wrangler authentication",
    ["node", cli, "auth", "token", "--json"],
    { privateOutput: true },
  ),
) as { token: string };
if (!auth.token)
  throw new Error(
    "Wrangler authentication token unavailable. Run wrangler login.",
  );
token = auth.token;
const zones = await api<
  { id: string; status: string; account: { id: string } }[]
>(`/zones?name=${production.zone}`);
const zone = zones[0];
if (
  zones.length !== 1 ||
  !zone ||
  zone.status !== "active" ||
  !who.accounts.some((a) => a.id === zone.account.id)
) {
  throw new Error(
    "The active production zone must belong to an authenticated account.",
  );
}
accountId = zone.account.id;
await mkdir(stateDir, { recursive: true });
const identityPath = resolve(stateDir, "identity.json");
if (await Bun.file(identityPath).exists()) {
  const pinned = JSON.parse(await readFile(identityPath, "utf8")) as {
    accountId: string;
    zoneId: string;
  };
  if (pinned.accountId !== accountId || pinned.zoneId !== zone.id)
    throw new Error(
      "Production account/zone differs from the locally pinned identity.",
    );
}
await writeFile(
  identityPath,
  JSON.stringify({ accountId, zoneId: zone.id }, null, 2),
);
const accountPath = `/accounts/${accountId}`;
const domains = await api<{ hostname: string; service: string }[]>(
  `${accountPath}/workers/domains`,
);
if (
  domains.some(
    (d) =>
      d.hostname === production.hostname && d.service !== production.webWorker,
  )
)
  throw new Error(
    "Production hostname belongs to another Worker; refusing to replace it.",
  );
if (
  domains.some(
    (d) =>
      d.service === production.webWorker && d.hostname !== production.hostname,
  )
)
  throw new Error(
    "The web Worker already owns other domains; refusing to remove them.",
  );
const routes = await api<{ pattern: string; script?: string }[]>(
  `/zones/${zone.id}/workers/routes`,
);
const patterns = ["/health*", "/auth/*", "/api/*"].map(
  (path) => `${production.hostname}${path}`,
);
if (
  routes.some(
    (route) =>
      patterns.includes(route.pattern) && route.script !== production.apiWorker,
  )
)
  throw new Error("A production API route belongs to another Worker.");
console.info("Verified production zone and pinned owning account.");

type Database = { name: string; uuid: string };
let databases = await api<Database[]>(
  `${accountPath}/d1/database?per_page=100`,
);
if (!databases.some((d) => d.name === production.database)) {
  await run("D1 provisioning", [
    "node",
    cli,
    "d1",
    "create",
    production.database,
    "--location",
    "apac",
    "--update-config=false",
  ]);
  databases = await api<Database[]>(`${accountPath}/d1/database?per_page=100`);
  console.info("Created production D1 database (APAC location hint).");
}
const database = databases.find((d) => d.name === production.database);
if (!database)
  throw new Error("Production D1 database was not found after provisioning.");
const authDatabaseId = database.uuid;
async function authQuery<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const rows = await api<{ results: T[]; success: boolean }[]>(
    `${accountPath}/d1/database/${authDatabaseId}/query`,
    { method: "POST", body: JSON.stringify({ sql, params }) },
  );
  if (rows.some((row) => !row.success))
    throw new Error("Auth preservation read failed.");
  return rows.flatMap((row) => row.results);
}
const existingKeyFile = Bun.file(resolve(stateDir, "encryption-key.json"));
const auditKey = (await existingKeyFile.exists())
  ? ((await existingKeyFile.json()) as { key: string }).key
  : "initial-empty-deployment";
const authBefore = await captureAuth(authQuery, auditKey);
const canaryFile = Bun.file(resolve(stateDir, "auth-canary.json"));
const canaryId = (await canaryFile.exists())
  ? ((await canaryFile.json()) as { userId: string }).userId
  : undefined;
const canaryBefore = canaryId
  ? await captureAuth(authQuery, auditKey, canaryId)
  : undefined;
if (
  canaryBefore &&
  (canaryBefore.state.size !== 1 ||
    [...canaryBefore.state.values()].some(
      (v) => v.connectionCount !== 1 || v.sessionCount !== 1,
    ))
)
  throw new Error(
    "Deployment auth canary is missing its synthetic connection/session.",
  );
const buckets = await api<{ buckets: { name: string }[] }>(
  `${accountPath}/r2/buckets?per_page=100`,
);
if (!buckets.buckets.some((b) => b.name === production.bucket)) {
  await run("R2 provisioning", [
    "node",
    cli,
    "r2",
    "bucket",
    "create",
    production.bucket,
    "--location",
    "apac",
    "--update-config=false",
  ]);
  console.info("Created private production R2 bucket (APAC location hint).");
}
const [managed, custom] = await Promise.all([
  api<{ enabled: boolean }>(
    `${accountPath}/r2/buckets/${production.bucket}/domains/managed`,
  ),
  api<{ domains: { enabled: boolean }[] }>(
    `${accountPath}/r2/buckets/${production.bucket}/domains/custom`,
  ),
]);
if (managed.enabled || custom.domains.some((d) => d.enabled))
  throw new Error(
    "Production R2 bucket has public access enabled; refusing deployment.",
  );

const apiConfig = await readConfig("apps/api/wrangler.jsonc");
apiConfig.account_id = accountId;
apiConfig.name = production.apiWorker;
apiConfig.main = resolve(root, "apps/api/src/index.ts");
apiConfig.routes = patterns.map((pattern) => ({ pattern, zone_id: zone.id }));
apiConfig.vars.ALLOWED_WEB_ORIGINS = origin;
apiConfig.vars.APP_ENV = "production";
apiConfig.vars.ENABLE_DEMO = "false";
apiConfig.vars.AI_MODE = "openrouter";
apiConfig.vars.OPENROUTER_CALLBACK_URL = `${origin}/auth/openrouter/callback`;
apiConfig.d1_databases = [
  {
    binding: "DB",
    database_name: production.database,
    database_id: database.uuid,
    migrations_dir: resolve(root, "packages/db/migrations"),
  },
];
apiConfig.r2_buckets = [{ binding: "ASSETS", bucket_name: production.bucket }];
apiConfig.workflows = [
  {
    binding: "STUDIO_WORKFLOW",
    name: production.workflow,
    class_name: "StudioWorkflow",
  },
];
const webConfig = await readConfig("apps/web/wrangler.jsonc");
webConfig.account_id = accountId;
webConfig.name = production.webWorker;
webConfig.main = createRequire(resolve(root, "apps/web/package.json")).resolve(
  "@astrojs/cloudflare/entrypoints/server",
);
webConfig.routes = [
  { pattern: production.hostname, custom_domain: true, zone_id: zone.id },
];
const apiConfigPath = resolve(stateDir, "api.json");
const webConfigPath = resolve(stateDir, "web.json");
await writeFile(apiConfigPath, JSON.stringify(apiConfig, null, 2));
await writeFile(webConfigPath, JSON.stringify(webConfig, null, 2));
await writeFile(
  resolve(stateDir, "resources.json"),
  JSON.stringify(
    { accountId, zoneId: zone.id, databaseId: database.uuid, ...production },
    null,
    2,
  ),
);
console.info(
  "Generated production configs under ignored .wrangler/production/; R2 public access is disabled.",
);

// Additive, tracked schema changes only. Secret values travel over stdin,
// never shell arguments or Wrangler output; preserve an existing server key.
await run(
  "Production migrations",
  [
    "node",
    cli,
    "d1",
    "migrations",
    "apply",
    production.database,
    "--remote",
    "--config",
    apiConfigPath,
  ],
  { privateOutput: true },
);
const settings = await api<{ bindings: { name: string; type: string }[] }>(
  `${accountPath}/workers/scripts/${production.apiWorker}/settings`,
);
if (
  !settings.bindings.some(
    (binding) =>
      binding.name === "APP_ENCRYPTION_KEY_B64" &&
      binding.type === "secret_text",
  )
) {
  const backupPath = resolve(stateDir, "encryption-key.json");
  let secret: string;
  if (await Bun.file(backupPath).exists()) {
    const backup = JSON.parse(await readFile(backupPath, "utf8")) as {
      key: string;
    };
    secret = backup.key;
  } else {
    secret = btoa(
      String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
    );
    await writeFile(backupPath, JSON.stringify({ version: "v1", key: secret }));
  }
  await run(
    "Production encryption secret",
    [
      "node",
      cli,
      "secret",
      "put",
      "APP_ENCRYPTION_KEY_B64",
      "--config",
      apiConfigPath,
    ],
    { input: secret, privateOutput: true },
  );
}
console.info(
  "Production migrations and encryption secret ready. OpenRouter signup requires no invite.",
);

// Build first, then publish the web origin and API routes. Never use --env:
// these are the default services in the sole remote production environment.
await run("Production web build", ["bun", "run", "build"], {
  cwd: resolve(root, "apps/web"),
  env: {
    PHOTO_STUDIO_WRANGLER_CONFIG: relative(
      resolve(root, "apps/web"),
      webConfigPath,
    )
      .split(sep)
      .join("/"),
    PUBLIC_API_URL: origin,
    PUBLIC_DEPLOYMENT_ENV: "production",
  },
});
console.info("Built production web bundle with same-origin API URL.");

// Check the Workers domain changeset before Wrangler's non-interactive publish
// (which would otherwise permit replacing existing DNS records).
// The changeset endpoint requires the script to exist, so initially upload
// without domains, then attach only the verified conflict-free hostname.
const builtWebPath = resolve(root, "apps/web/dist/server/wrangler.json");
const builtWeb = JSON.parse(await readFile(builtWebPath, "utf8"));
const desiredRoutes = builtWeb.routes;
if (!domains.some((d) => d.hostname === production.hostname)) {
  builtWeb.routes = [];
  await writeFile(builtWebPath, JSON.stringify(builtWeb, null, 2));
  await run("Production web upload", [
    "node",
    cli,
    "deploy",
    "--config",
    builtWebPath,
  ]);
}
const changeset = await api<{ conflicting: unknown[]; removed: unknown[] }>(
  `${accountPath}/workers/scripts/${production.webWorker}/domains/changeset?replace_state=true`,
  {
    method: "POST",
    body: JSON.stringify([{ hostname: production.hostname, zone_id: zone.id }]),
  },
);
if (changeset.conflicting.length || changeset.removed.length)
  throw new Error(
    "Custom domain changes conflict with existing DNS/domains; refusing to overwrite them.",
  );
builtWeb.routes = desiredRoutes;
await writeFile(builtWebPath, JSON.stringify(builtWeb, null, 2));
// Additive API contracts must be live before the new browser bundle.
await run("Production API deployment", [
  "node",
  cli,
  "deploy",
  "--config",
  apiConfigPath,
]);
console.info("Published API routes and production Workflow binding.");

await run("Production web domain publish", [
  "node",
  cli,
  "deploy",
  "--config",
  builtWebPath,
]);
console.info(`Published web Worker at ${origin}.`);
// Read-only infrastructure verification; do not run a provider or create jobs.
const query = await api<{ results: { ok: number }[] }[]>(
  `${accountPath}/d1/database/${database.uuid}/query`,
  { method: "POST", body: JSON.stringify({ sql: "SELECT 1 AS ok" }) },
);
if (query[0]?.results[0]?.ok !== 1)
  throw new Error("Production D1 read probe failed.");
await api(`${accountPath}/workflows/${production.workflow}`);
const deadline = Date.now() + 120000;
let ready = false;
while (Date.now() < deadline) {
  try {
    const response = await fetch(`${origin}/health`, {
      signal: AbortSignal.timeout(10000),
    });
    const body = (await response.json()) as {
      data?: { service?: string; aiMode?: string };
    };
    if (
      response.ok &&
      body.data?.service === "photo-studio-api" &&
      body.data.aiMode === "openrouter"
    ) {
      ready = true;
      break;
    }
  } catch {
    /* DNS/certificate propagation only; never retry a paid call. */
  }
  await Bun.sleep(3000);
}
if (!ready)
  throw new Error(
    "Deployment uploaded, but public HTTPS health is not ready yet. Do not recreate resources; check DNS/TLS propagation.",
  );
const authPreserved = await verifyAuth(authQuery, auditKey, authBefore);
if (canaryBefore && canaryId) {
  await verifyAuth(authQuery, auditKey, canaryBefore, canaryId);
  console.info(
    "PASS: non-empty synthetic auth canary connection/session preserved byte for byte across deployment.",
  );
}
console.info(
  `Auth preservation: ${authPreserved.unchanged} unchanged existing accounts; ${authPreserved.explicitChanges} changes explained by explicit lifecycle events. No credential/hash output.`,
);
console.info(
  `PASS: ${origin}/health, production D1, private R2, Workflow. No provider calls.`,
);
