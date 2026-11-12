import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseConfigFileTextToJson } from "typescript";
import production from "../infra/production.json";
import { captureAuth, verifyAuth } from "./auth-preservation";

const root = resolve(import.meta.dir, "..");
const configPath = resolve(root, ".wrangler/production/api.json");
const cli = resolve(root, "apps/api/node_modules/wrangler/bin/wrangler.js");
const confirmation = "I CONFIRM THE SHUTTERSTOCK AI REFERENCE AGREEMENT";
const settingNames = [
  "REFERENCE_SOURCE",
  "SHUTTERSTOCK_ACCESS_TOKEN",
  "SHUTTERSTOCK_SUBSCRIPTION_ID",
  "SHUTTERSTOCK_LICENSE",
  "SHUTTERSTOCK_AI_REFERENCE_APPROVED",
  "SHUTTERSTOCK_AGREEMENT_VERSION",
] as const;
class SetupError extends Error {}
function requireSafe(value: unknown, message: string): asserts value {
  if (!value) throw new SetupError(message);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.info(`Usage: bun run setup:shutterstock

Interactive production setup; requires the existing pinned production configuration
and Wrangler login. Enter a subscription ID and agreement version, confirm the
approved contract scope, then enter the token in Wrangler's hidden secret prompt.
The contract must cover automatic selection, private storage, customer outputs and
non-training third-party planning/image inference. Confirmation does not obtain rights.

Only the six Shutterstock/reference settings are updated. Existing OpenRouter
connections, sessions and the encryption master secret are preserved and checked.
No Shutterstock search, licensing or AI inference is performed. No token is put in
shell arguments, files or this tool's logs. --help requires no login or changes.`);
    return;
  }
  requireSafe(args.length === 0, "Unknown option; use --help.");
  requireSafe(
    process.stdin.isTTY && process.stdout.isTTY,
    "Interactive terminal required. Piped/non-interactive setup is disabled; use --help.",
  );

  const pinned = (await Bun.file(
    resolve(root, ".wrangler/production/identity.json"),
  ).json()) as { accountId: string; zoneId: string };
  const config = (await Bun.file(configPath).json()) as {
    name: string;
    account_id: string;
    vars: Record<string, unknown>;
    routes: { pattern: string; zone_id: string }[];
    d1_databases: {
      binding: string;
      database_name: string;
      database_id: string;
    }[];
  };
  const base = parseConfigFileTextToJson(
    "apps/api/wrangler.jsonc",
    await Bun.file(resolve(root, "apps/api/wrangler.jsonc")).text(),
  );
  const database = config.d1_databases?.find((db) => db.binding === "DB");
  requireSafe(database, "Pinned production DB binding is missing.");
  const databaseId = database.database_id;
  const expectedRoutes = ["/health*", "/auth/*", "/api/*"].map(
    (path) => `${production.hostname}${path}`,
  );
  requireSafe(
    /^[a-f\d]{32}$/i.test(pinned.accountId) &&
      /^[a-f\d]{32}$/i.test(pinned.zoneId) &&
      config.name === production.apiWorker &&
      config.account_id === pinned.accountId &&
      config.vars?.APP_ENV === "production" &&
      config.routes?.length === expectedRoutes.length &&
      config.routes.every(
        (route) =>
          expectedRoutes.includes(route.pattern) &&
          route.zone_id === pinned.zoneId,
      ) &&
      database?.database_name === production.database &&
      /^[a-f\d-]{36}$/i.test(database.database_id),
    "Production configuration differs from the pinned account, routes or database.",
  );
  requireSafe(
    !base.error &&
      settingNames.every(
        (name) =>
          !Object.hasOwn(config.vars, name) &&
          !Object.hasOwn(base.config.vars ?? {}, name),
      ),
    "Reference settings must not also exist in Wrangler vars; resolve the configuration collision first.",
  );
  const backup = (await Bun.file(
    resolve(root, ".wrangler/production/encryption-key.json"),
  ).json()) as { key: string; version: string };
  requireSafe(
    typeof backup.key === "string" &&
      /^[A-Za-z\d+/]{43}=$/.test(backup.key) &&
      backup.version === config.vars.APP_ENCRYPTION_KEY_VERSION,
    "Existing encryption key backup/version is required; no master key will be created or changed.",
  );
  const env = {
    ...process.env,
    CLOUDFLARE_ACCOUNT_ID: pinned.accountId,
    WRANGLER_SEND_METRICS: "false",
    WRANGLER_LOG: "info",
  };
  async function runPrivate(args: string[], input = "") {
    const child = Bun.spawn(["node", cli, ...args], {
      cwd: root,
      env,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    child.stdin.write(input);
    child.stdin.end();
    const [out, , code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    requireSafe(
      code === 0,
      "Wrangler operation failed; credential output was suppressed.",
    );
    return out;
  }
  const auth = JSON.parse(await runPrivate(["auth", "token", "--json"])) as {
    token?: string;
  };
  requireSafe(auth.token, "Wrangler login required before setup.");
  async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4${path}`,
      {
        ...init,
        redirect: "manual",
        headers: {
          Authorization: `Bearer ${auth.token}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(30000),
      },
    );
    const body = (await response.json()) as { success: boolean; result: T };
    requireSafe(
      response.ok && body.success,
      "Cloudflare identity/configuration verification failed.",
    );
    return body.result;
  }
  const zones = await api<
    { id: string; status: string; account: { id: string } }[]
  >(`/zones?name=${production.zone}`);
  requireSafe(
    zones.length === 1 &&
      zones[0]?.id === pinned.zoneId &&
      zones[0].account.id === pinned.accountId &&
      zones[0].status === "active",
    "Production zone owner differs from the pinned identity.",
  );
  const workerPath = `/accounts/${pinned.accountId}/workers/scripts/${production.apiWorker}`;
  type Settings = { bindings: { name: string; type: string; text?: string }[] };
  const settingsBefore = await api<Settings>(`${workerPath}/settings`);
  const masterPresent = (settings: Settings) =>
    settings.bindings.some(
      (binding) =>
        binding.name === "APP_ENCRYPTION_KEY_B64" &&
        binding.type === "secret_text",
    );
  requireSafe(
    masterPresent(settingsBefore),
    "Existing production encryption secret is missing; setup stopped.",
  );
  const remoteDatabase = await api<{ name: string }>(
    `/accounts/${pinned.accountId}/d1/database/${databaseId}`,
  );
  requireSafe(
    remoteDatabase.name === production.database,
    "Production database identity does not match.",
  );
  async function authQuery<T>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const rows = await api<{ success: boolean; results: T[] }[]>(
      `/accounts/${pinned.accountId}/d1/database/${databaseId}/query`,
      { method: "POST", body: JSON.stringify({ sql, params }) },
    );
    requireSafe(
      rows.every((row) => row.success),
      "Auth preservation read failed.",
    );
    return rows.flatMap((row) => row.results);
  }

  console.info(
    "Verified production identity. This setup does not validate or purchase Shutterstock rights.",
  );
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  let subscriptionId: string, agreementVersion: string;
  try {
    subscriptionId = (
      await prompt.question("Approved API Subscription ID: ")
    ).trim();
    agreementVersion = (
      await prompt.question("Approved agreement/version identifier: ")
    ).trim();
    requireSafe(
      /^[A-Za-z\d_-]{1,128}$/.test(subscriptionId),
      "Invalid subscription ID format.",
    );
    requireSafe(
      /^[\x20-\x7e]{1,120}$/.test(agreementVersion),
      "Agreement version must be 1–120 printable ASCII characters.",
    );
    console.info(
      `Confirm the contract scope described by --help by typing:\n${confirmation}`,
    );
    requireSafe(
      (await prompt.question("> ")).trim() === confirmation,
      "Contract confirmation did not match; nothing changed.",
    );
  } finally {
    prompt.close();
  }
  // All validation and confirmation finish before the first secret write.
  const before = await captureAuth(authQuery, backup.key);
  const canaryFile = Bun.file(
    resolve(root, ".wrangler/production/auth-canary.json"),
  );
  const canaryId = (await canaryFile.exists())
    ? ((await canaryFile.json()) as { userId: string }).userId
    : undefined;
  const canaryBefore = canaryId
    ? await captureAuth(authQuery, backup.key, canaryId)
    : undefined;
  requireSafe(
    !canaryBefore ||
      (canaryBefore.state.size === 1 &&
        [...canaryBefore.state.values()].every(
          (state) => state.connectionCount === 1 && state.sessionCount === 1,
        )),
    "Existing auth canary is not intact; no configuration was changed.",
  );
  let complete = false;
  try {
    console.info(
      "Enter the access token only in Wrangler's hidden prompt below.",
    );
    const tokenWrite = Bun.spawn(
      [
        "node",
        cli,
        "secret",
        "put",
        "SHUTTERSTOCK_ACCESS_TOKEN",
        "--config",
        configPath,
      ],
      {
        cwd: root,
        env,
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      },
    );
    requireSafe(
      (await tokenWrite.exited) === 0,
      "Token update failed or was cancelled; other reference settings were not updated.",
    );
    // Five settings are one atomic bulk update; token never enters this process.
    await runPrivate(
      ["secret", "bulk", "--config", configPath],
      JSON.stringify({
        REFERENCE_SOURCE: "shutterstock",
        SHUTTERSTOCK_SUBSCRIPTION_ID: subscriptionId,
        SHUTTERSTOCK_LICENSE: "platform",
        SHUTTERSTOCK_AI_REFERENCE_APPROVED: "true",
        SHUTTERSTOCK_AGREEMENT_VERSION: agreementVersion,
      }),
    );
    complete = true;
  } finally {
    const preserved = await verifyAuth(authQuery, backup.key, before);
    if (canaryBefore && canaryId)
      await verifyAuth(authQuery, backup.key, canaryBefore, canaryId);
    const after = await api<Settings>(`${workerPath}/settings`);
    requireSafe(
      masterPresent(after),
      "Master-secret binding verification failed after setup.",
    );
    const version = (settings: Settings) =>
      settings.bindings.find(
        (binding) => binding.name === "APP_ENCRYPTION_KEY_VERSION",
      )?.text;
    requireSafe(
      version(after) === version(settingsBefore),
      "Master-secret version changed during setup.",
    );
    if (complete)
      requireSafe(
        settingNames.every((name) =>
          after.bindings.some(
            (binding) =>
              binding.name === name && binding.type === "secret_text",
          ),
        ),
        "Reference settings were not all installed; inspect configuration before use.",
      );
    console.info(
      `Auth preservation verified: ${preserved.unchanged} existing accounts unchanged; ${preserved.explicitChanges} explicit lifecycle changes. No master secret was targeted.`,
    );
  }
  console.info(
    "Shutterstock settings installed as persistent Worker secrets. Subscription, rights and real-image quality still require operator verification; no search/license/AI call was made.",
  );
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(
      error instanceof SetupError
        ? error.message
        : "Setup failed; sensitive diagnostic details were suppressed. Check pinned configuration and Wrangler login.",
    );
    process.exitCode = 1;
  });
}
