import { resolve, relative, sep } from "node:path";
import production from "../infra/production.json";
import { captureAuth, verifyAuth } from "./auth-preservation";

// UI releases reuse the verified production identity and never deploy the API,
// migrate D1, update secrets, or touch ongoing customer Workflows.
const root = resolve(import.meta.dir, ".."),
  cli = resolve(root, "apps/api/node_modules/wrangler/bin/wrangler.js"),
  webRoot = resolve(root, "apps/web"),
  origin = `https://${production.hostname}`;
const configPath = resolve(root, ".wrangler/production/web.json");
const pinned = (await Bun.file(
  resolve(root, ".wrangler/production/identity.json"),
).json()) as { accountId: string; zoneId: string };
const config = (await Bun.file(configPath).json()) as {
  name: string;
  account_id: string;
  routes: { pattern: string; custom_domain: boolean; zone_id: string }[];
};
if (
  config.name !== production.webWorker ||
  config.account_id !== pinned.accountId ||
  config.routes.length !== 1 ||
  !config.routes.every(
    (r) =>
      r.pattern === production.hostname &&
      r.custom_domain &&
      r.zone_id === pinned.zoneId,
  )
)
  throw new Error(
    "Production web configuration differs from the pinned identity.",
  );
let token = "";
async function run(
  label: string,
  args: string[],
  options: {
    cwd?: string;
    env?: Record<string, string>;
    private?: boolean;
  } = {},
) {
  const child = Bun.spawn(args, {
    cwd: options.cwd ?? root,
    env: { ...process.env, WRANGLER_SEND_METRICS: "false", ...options.env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) {
    if (!options.private)
      console.error(
        (out + err)
          .replaceAll(token || "__none__", "[redacted]")
          .replace(/\b[a-f\d]{32}\b/gi, "[resource-id]")
          .replace(
            /\b[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}\b/gi,
            "[resource-id]",
          ),
      );
    throw new Error(`${label} failed.`);
  }
  return out;
}
token = (
  JSON.parse(
    await run(
      "Wrangler authentication",
      ["node", cli, "auth", "token", "--json"],
      { private: true },
    ),
  ) as { token: string }
).token;
if (!token) throw new Error("Cloudflare login required.");
async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(30000),
  });
  const body = (await response.json()) as { success: boolean; result: T };
  if (!response.ok || !body.success)
    throw new Error("Cloudflare web deployment verification failed.");
  return body.result;
}
const zones = await api<
  { id: string; status: string; account: { id: string } }[]
>(`/zones?name=${production.zone}`);
if (
  zones.length !== 1 ||
  !zones.every(
    (z) =>
      z.id === pinned.zoneId &&
      z.account.id === pinned.accountId &&
      z.status === "active",
  )
)
  throw new Error("Zone owner differs from the production pin.");
const domains = await api<{ hostname: string; service: string }[]>(
  `/accounts/${pinned.accountId}/workers/domains`,
);
if (
  !domains.some(
    (d) =>
      d.hostname === production.hostname && d.service === production.webWorker,
  )
)
  throw new Error(
    "Existing production domain is not owned by this web Worker.",
  );
console.info(
  "Verified production web identity. Publishing UI only; API, data and Workflows are untouched.",
);
const apiConfig = (await Bun.file(
  resolve(root, ".wrangler/production/api.json"),
).json()) as { d1_databases: { database_id: string }[] };
const auditKey = (
  (await Bun.file(
    resolve(root, ".wrangler/production/encryption-key.json"),
  ).json()) as { key: string }
).key;
const authDatabaseId = apiConfig.d1_databases[0]?.database_id;
if (!authDatabaseId) throw new Error("Missing production auth database.");
async function authQuery<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const rows = await api<{ results: T[]; success: boolean }[]>(
    `/accounts/${pinned.accountId}/d1/database/${authDatabaseId}/query`,
    { method: "POST", body: JSON.stringify({ sql, params }) },
  );
  if (rows.some((row) => !row.success))
    throw new Error("Auth preservation read failed.");
  return rows.flatMap((row) => row.results);
}
const authBefore = await captureAuth(authQuery, auditKey);
const canaryFile = Bun.file(
  resolve(root, ".wrangler/production/auth-canary.json"),
);
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
await run("Production web build", ["bun", "run", "build"], {
  cwd: webRoot,
  env: {
    PHOTO_STUDIO_WRANGLER_CONFIG: relative(webRoot, configPath)
      .split(sep)
      .join("/"),
    PUBLIC_API_URL: origin,
    PUBLIC_DEPLOYMENT_ENV: "production",
  },
});
const builtPath = resolve(webRoot, "dist/server/wrangler.json"),
  built = (await Bun.file(builtPath).json()) as typeof config;
if (
  built.name !== config.name ||
  built.account_id !== pinned.accountId ||
  built.routes.length !== 1 ||
  !built.routes.every(
    (r) =>
      r.pattern === production.hostname &&
      r.custom_domain &&
      r.zone_id === pinned.zoneId,
  )
)
  throw new Error(
    "Built web target differs from verified production configuration.",
  );
const changeset = await api<{ conflicting: unknown[]; removed: unknown[] }>(
  `/accounts/${pinned.accountId}/workers/scripts/${production.webWorker}/domains/changeset?replace_state=true`,
  {
    method: "POST",
    body: JSON.stringify([
      { hostname: production.hostname, zone_id: pinned.zoneId },
    ]),
  },
);
if (changeset.conflicting.length || changeset.removed.length)
  throw new Error("Production domain conflict; refusing overwrite.");
await run("Production web publish", [
  "node",
  cli,
  "deploy",
  "--config",
  builtPath,
]);
const authPreserved = await verifyAuth(authQuery, auditKey, authBefore);
if (canaryBefore && canaryId) {
  await verifyAuth(authQuery, auditKey, canaryBefore, canaryId);
  console.info(
    "PASS: non-empty synthetic auth canary connection/session preserved byte for byte across web deployment.",
  );
}
console.info(
  `Auth preservation: ${authPreserved.unchanged} unchanged existing accounts; ${authPreserved.explicitChanges} changes explained by explicit lifecycle events. No credential/hash output.`,
);
console.info(
  `PASS: published web UI at ${origin}. No API deployment, migration or AI invocation.`,
);
