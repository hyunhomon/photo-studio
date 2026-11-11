import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import production from "../infra/production.json";

// Deliberately cannot accept arbitrary accounts, databases, buckets, or SQL.
// Credentials and every row/object identifier remain in memory; print counts only.
const expected = {
  zone: "cloby.co",
  hostname: "photo-studio.cloby.co",
  webWorker: "photo-studio-web",
  apiWorker: "photo-studio-api",
  database: "photo-studio-production",
  bucket: "photo-studio-production-assets",
  workflow: "photo-studio-production",
} as const;
const root = resolve(import.meta.dir, "..");
const endpoint = "https://api.cloudflare.com/client/v4";
const maxEntries = 100000;

class ResetError extends Error {}
function requireSafe(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ResetError(message);
}

export function resetFlags(args: string[]) {
  const allowed = new Set([
    "--execute",
    "--confirm-photo-studio-reset",
    "--help",
  ]);
  requireSafe(
    args.every((arg) => allowed.has(arg)),
    "Unknown reset option; use --help.",
  );
  requireSafe(
    !args.includes("--execute") ||
      args.includes("--confirm-photo-studio-reset"),
    "Execution requires --execute and --confirm-photo-studio-reset.",
  );
  return { execute: args.includes("--execute"), help: args.includes("--help") };
}

// Child-first order also supports the previous project-bearing schema. New or
// unfamiliar tables stop the script rather than being silently retained/deleted.
export const resetTables = [
  "feedback",
  "quality_evaluations",
  "generation_attempts",
  "generation_jobs",
  "shoot_plans",
  "assets",
  "products",
  "projects",
  "brand_presets",
  "oauth_flows",
  "sessions",
  "provider_connections",
  "invite_redemptions",
  "invite_codes",
  "auth_events",
  "rate_limits",
  "storage_cleanup",
  "media_purges",
  "users",
] as const;
const metadataTable = (name: string) =>
  name === "d1_migrations" ||
  name === "__drizzle_migrations" ||
  name.startsWith("sqlite_") ||
  name.startsWith("_cf_");

export function scopedResetTables(names: string[]) {
  const allowed = new Set<string>(resetTables);
  requireSafe(
    names.every((name) => metadataTable(name) || allowed.has(name)),
    "Unknown application table; review the reset whitelist before continuing.",
  );
  requireSafe(
    ["users", "products", "assets", "generation_jobs"].every((name) =>
      names.includes(name),
    ),
    "Expected studio schema was not found.",
  );
  return resetTables.filter((name) => names.includes(name));
}

// The R2 REST contract requires literal slashes. Reject dot path segments before
// URL normalization: a malformed object key must never become a bucket DELETE.
export function objectDeletePath(accountId: string, key: string) {
  requireSafe(/^[a-f\d]{32}$/i.test(accountId), "Invalid account pin.");
  requireSafe(
    key.length > 0 &&
      key.split("/").every((part) => part !== "." && part !== ".."),
    "Unsafe object path; no deletion was attempted for this object.",
  );
  const prefix = `/accounts/${accountId}/r2/buckets/${expected.bucket}/objects/`;
  const path = prefix + key.split("/").map(encodeURIComponent).join("/");
  const normalized = new URL(endpoint + path);
  requireSafe(
    normalized.origin === new URL(endpoint).origin &&
      normalized.pathname === `/client/v4${path}` &&
      path.startsWith(prefix) &&
      path.length > prefix.length,
    "Unsafe object path; no deletion was attempted for this object.",
  );
  return path;
}

interface Envelope<T> {
  success: boolean;
  result: T;
  result_info?: {
    cursor?: string;
    is_truncated?: boolean;
    total_pages?: number;
    page?: number;
  };
}
interface Instance {
  id: string;
  status: string;
}
interface StoredObject {
  key: string;
  size: number;
}
const terminal = new Set(["complete", "errored", "terminated"]);
const knownStatus = new Set([
  ...terminal,
  "queued",
  "running",
  "paused",
  "waitingForPause",
  "waiting",
  "rollingBack",
]);

async function privateCommand(args: string[]) {
  const child = Bun.spawn(args, {
    cwd: root,
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, , code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  requireSafe(
    code === 0,
    "Wrangler authentication unavailable; log in locally.",
  );
  try {
    return JSON.parse(out) as Record<string, unknown>;
  } catch {
    throw new ResetError("Wrangler returned an unexpected private response.");
  }
}

async function main() {
  const flags = resetFlags(process.argv.slice(2));
  if (flags.help) {
    console.info(
      "Usage: bun run scripts/reset-production-data.ts [--execute --confirm-photo-studio-reset]\nDefault is read-only dry run. Execution removes all studio data, accounts, sessions, stored provider connections, and private media. Cloudflare resources, schema, migration ledger, and encryption master secret remain. No AI calls are made.",
    );
    return;
  }
  requireSafe(
    Object.entries(expected).every(
      ([key, value]) => production[key as keyof typeof expected] === value,
    ),
    "Production service pins changed; refusing reset.",
  );
  const identity = JSON.parse(
    await readFile(resolve(root, ".wrangler/production/identity.json"), "utf8"),
  ) as { accountId: string; zoneId: string };
  const config = JSON.parse(
    await readFile(resolve(root, ".wrangler/production/api.json"), "utf8"),
  ) as {
    name: string;
    account_id: string;
    d1_databases: {
      binding: string;
      database_id: string;
      database_name: string;
    }[];
    r2_buckets: { binding: string; bucket_name: string }[];
    workflows: { binding: string; name: string; class_name: string }[];
    routes: { pattern: string; zone_id: string }[];
  };
  const db = config.d1_databases?.find((entry) => entry.binding === "DB");
  requireSafe(
    /^[a-f\d]{32}$/i.test(identity.accountId) &&
      /^[a-f\d]{32}$/i.test(identity.zoneId) &&
      config.account_id === identity.accountId &&
      config.name === expected.apiWorker &&
      config.d1_databases.length === 1 &&
      db?.database_name === expected.database &&
      /^[a-f\d-]{36}$/i.test(db.database_id) &&
      config.r2_buckets.length === 1 &&
      config.r2_buckets[0]?.binding === "ASSETS" &&
      config.r2_buckets[0]?.bucket_name === expected.bucket &&
      config.workflows.length === 1 &&
      config.workflows[0]?.binding === "STUDIO_WORKFLOW" &&
      config.workflows[0]?.name === expected.workflow &&
      config.workflows[0]?.class_name === "StudioWorkflow" &&
      config.routes.length > 0 &&
      config.routes.every(
        (route) =>
          route.pattern.startsWith(`${expected.hostname}/`) &&
          route.zone_id === identity.zoneId,
      ),
    "Ignored production configuration does not match the service pins.",
  );
  const cli = resolve(root, "apps/api/node_modules/wrangler/bin/wrangler.js");
  const who = (await privateCommand(["node", cli, "whoami", "--json"])) as {
    accounts?: { id: string }[];
  };
  requireSafe(
    who.accounts?.some((account) => account.id === identity.accountId),
    "Authenticated account does not match the service pin.",
  );
  const auth = await privateCommand(["node", cli, "auth", "token", "--json"]);
  requireSafe(
    typeof auth.token === "string" && auth.token.length > 0,
    "Missing authentication token.",
  );
  const token = auth.token;
  const account = `/accounts/${identity.accountId}`;
  const database = `${account}/d1/database/${db.database_id}`;
  const bucket = `${account}/r2/buckets/${expected.bucket}`;
  const workflow = `${account}/workflows/${expected.workflow}`;

  async function api<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<Envelope<T>> {
    // Only safe fixed paths or validated/encoded object and instance paths enter.
    const response = await fetch(endpoint + path, {
      ...init,
      redirect: "manual",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(30000),
    });
    const deletingObject =
      init.method === "DELETE" && path.startsWith(`${bucket}/objects/`);
    if (deletingObject && response.status === 404)
      return { success: true, result: undefined as T };
    requireSafe(
      response.ok,
      `Cloudflare request failed (HTTP ${response.status}).`,
    );
    const text = await response.text();
    if (deletingObject && text.length === 0)
      return { success: true, result: undefined as T };
    const body = JSON.parse(text) as Envelope<T>;
    requireSafe(body.success === true, "Cloudflare request was unsuccessful.");
    return body;
  }
  async function query<T>(sql: string, params: unknown[] = []) {
    const body = await api<{ success: boolean; results: T[] }[]>(
      `${database}/query`,
      { method: "POST", body: JSON.stringify({ sql, params }) },
    );
    requireSafe(
      Array.isArray(body.result) &&
        body.result.every((result) => result.success),
      "D1 query failed; no raw database details were logged.",
    );
    return body.result.flatMap((result) => result.results);
  }
  const [zones, domains, dbInfo, bucketInfo, workflowInfo] = await Promise.all([
    api<{ id: string; status: string; account: { id: string } }[]>(
      `/zones?name=${expected.zone}`,
    ),
    api<{ hostname: string; service: string; zone_id: string }[]>(
      `${account}/workers/domains`,
    ),
    api<{ name: string }>(database),
    api<{ name: string }>(bucket),
    api<{ name: string; script_name: string }>(workflow),
  ]);
  requireSafe(
    zones.result.length === 1 &&
      zones.result[0]?.id === identity.zoneId &&
      zones.result[0]?.account.id === identity.accountId &&
      zones.result[0]?.status === "active" &&
      domains.result.some(
        (domain) =>
          domain.hostname === expected.hostname &&
          domain.service === expected.webWorker &&
          domain.zone_id === identity.zoneId,
      ) &&
      dbInfo.result.name === expected.database &&
      bucketInfo.result.name === expected.bucket &&
      workflowInfo.result.name === expected.workflow &&
      workflowInfo.result.script_name === expected.apiWorker,
    "Live service resources do not match the production pins.",
  );

  const schema = await query<{
    name: string;
    type: string;
    sql: string | null;
  }>(
    "SELECT name,type,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",
  );
  const tables = scopedResetTables(
    schema.filter((item) => item.type === "table").map((item) => item.name),
  );
  const ledgers = schema
    .filter((item) => item.type === "table" && metadataTable(item.name))
    .map((item) => item.name)
    .filter(
      (name) => name === "d1_migrations" || name === "__drizzle_migrations",
    );
  const ledgerBefore = await Promise.all(
    ledgers.map((name) => query(`SELECT * FROM "${name}" ORDER BY 1`)),
  );
  async function counts() {
    return Object.fromEntries(
      await Promise.all(
        tables.map(async (name) => {
          const rows = await query<{ count: number }>(
            `SELECT count(*) AS count FROM "${name}"`,
          );
          requireSafe(
            Number.isSafeInteger(rows[0]?.count),
            "Invalid row count.",
          );
          return [name, rows[0]?.count ?? 0];
        }),
      ),
    ) as Record<string, number>;
  }
  async function objects() {
    const result: StoredObject[] = [];
    const cursors = new Set<string>();
    let cursor: string | undefined;
    do {
      const params = new URLSearchParams({ per_page: "1000" });
      if (cursor) params.set("cursor", cursor);
      const page = await api<StoredObject[]>(`${bucket}/objects?${params}`);
      requireSafe(
        Array.isArray(page.result),
        "Unexpected private media listing.",
      );
      for (const item of page.result) {
        requireSafe(
          typeof item.key === "string" &&
            Number.isSafeInteger(item.size) &&
            item.size >= 0,
          "Unexpected private media listing.",
        );
        objectDeletePath(identity.accountId, item.key);
        result.push({ key: item.key, size: item.size });
      }
      requireSafe(
        result.length <= maxEntries,
        "Media listing exceeds the reset safety limit.",
      );
      cursor = page.result_info?.is_truncated
        ? page.result_info.cursor
        : undefined;
      requireSafe(
        !page.result_info?.is_truncated || (cursor && !cursors.has(cursor)),
        "Private media pagination could not be verified.",
      );
      if (cursor) cursors.add(cursor);
    } while (cursor);
    return result;
  }
  async function instances() {
    const result: Instance[] = [];
    const cursors = new Set<string>();
    let cursor: string | undefined;
    do {
      const params = new URLSearchParams({ per_page: "100" });
      if (cursor) params.set("cursor", cursor);
      const page = await api<Instance[]>(`${workflow}/instances?${params}`);
      requireSafe(Array.isArray(page.result), "Unexpected Workflow listing.");
      for (const item of page.result) {
        requireSafe(
          typeof item.id === "string" &&
            /^[a-zA-Z0-9_-]{1,100}$/.test(item.id) &&
            knownStatus.has(item.status),
          "Unexpected Workflow status or instance identifier.",
        );
        result.push({ id: item.id, status: item.status });
      }
      requireSafe(
        result.length <= maxEntries,
        "Workflow listing exceeds the reset safety limit.",
      );
      cursor = page.result_info?.cursor;
      requireSafe(
        !cursor || !cursors.has(cursor),
        "Workflow pagination could not be verified.",
      );
      if (cursor) cursors.add(cursor);
      requireSafe(
        cursor ||
          page.result.length < 100 ||
          page.result_info?.total_pages === 1,
        "Workflow pagination did not return a verifiable cursor.",
      );
    } while (cursor);
    return result;
  }
  const [before, media, nativeInstances, activeRows] = await Promise.all([
    counts(),
    objects(),
    instances(),
    query<{ count: number }>(
      "SELECT count(*) AS count FROM generation_jobs WHERE status IN ('queued','running')",
    ),
  ]);
  console.info(
    JSON.stringify({
      mode: flags.execute ? "execute" : "dry-run",
      resourcePinsVerified: true,
      rows: before,
      privateObjects: media.length,
      privateBytes: media.reduce((sum, item) => sum + item.size, 0),
      activeJobs: activeRows[0]?.count ?? 0,
      activeWorkflows: nativeInstances.filter(
        (item) => !terminal.has(item.status),
      ).length,
      migrationLedgersPreserved: ledgers.length,
    }),
  );
  if (!flags.execute) return;

  // Revoke browser access before stopping durable jobs. If termination fails,
  // leave records gated rather than reopening an uncertain paid operation.
  for (const sql of [
    "UPDATE users SET status='deleting'",
    "UPDATE products SET status='deleting'",
    "DELETE FROM sessions",
    "DELETE FROM oauth_flows",
  ])
    await query(sql);
  await query(
    "UPDATE generation_jobs SET status='cancelled',stage='cancelled',error_code='SERVICE_RESET',finished_at=? WHERE status IN ('queued','running')",
    [Date.now()],
  );
  for (const instance of nativeInstances.filter(
    (item) => !terminal.has(item.status),
  )) {
    await api(
      `${workflow}/instances/${encodeURIComponent(instance.id)}/status`,
      {
        method: "PATCH",
        body: JSON.stringify({ status: "terminate" }),
      },
    );
  }
  const deadline = Date.now() + 30000;
  while ((await instances()).some((item) => !terminal.has(item.status))) {
    requireSafe(
      Date.now() < deadline,
      "Active Workflows remain; media and rows were not wiped. Rerun after termination is verified.",
    );
    await Bun.sleep(1000);
  }

  // Re-list after access revocation to include uploads already in flight, then
  // delete only individual objects in this single, pinned, private bucket.
  let deleted = 0;
  for (let pass = 0; pass < 3; pass++) {
    const remaining = await objects();
    if (remaining.length === 0) break;
    for (let index = 0; index < remaining.length; index += 4) {
      await Promise.all(
        remaining.slice(index, index + 4).map(async (item) => {
          await api(objectDeletePath(identity.accountId, item.key), {
            method: "DELETE",
          });
          deleted++;
        }),
      );
    }
    await Bun.sleep(1000);
  }
  requireSafe(
    (await objects()).length === 0,
    "Private media is still arriving; row reset stopped. Rerun after in-flight uploads finish.",
  );
  for (const name of tables) await query(`DELETE FROM "${name}"`);
  const [
    after,
    remainingObjects,
    remainingInstances,
    schemaAfter,
    fk,
    ledgerAfter,
  ] = await Promise.all([
    counts(),
    objects(),
    instances(),
    query(
      "SELECT name,type,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",
    ),
    query("PRAGMA foreign_key_check"),
    Promise.all(
      ledgers.map((name) => query(`SELECT * FROM "${name}" ORDER BY 1`)),
    ),
  ]);
  requireSafe(
    Object.values(after).every((count) => count === 0) &&
      remainingObjects.length === 0 &&
      remainingInstances.every((item) => terminal.has(item.status)) &&
      fk.length === 0 &&
      JSON.stringify(schema) === JSON.stringify(schemaAfter) &&
      JSON.stringify(ledgerBefore) === JSON.stringify(ledgerAfter),
    "Final empty-state verification failed; inspect with a dry run before retrying.",
  );
  console.info(
    JSON.stringify({
      resetComplete: true,
      rows: after,
      deletedPrivateObjects: deleted,
      foreignKeyErrors: 0,
      schemaPreserved: true,
      migrationLedgersPreserved: true,
      credentialsRequireReconnect: true,
    }),
  );
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    // Never print an upstream Error, response, command output, URL, or stack.
    console.error(
      error instanceof ResetError
        ? error.message
        : "Reset stopped because a private operation failed. No raw details were logged.",
    );
    process.exitCode = 1;
  });
}
