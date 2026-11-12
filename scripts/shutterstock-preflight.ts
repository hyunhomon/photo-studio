import { resolve } from "node:path";
import { parseShutterstockProbeVariable } from "./shutterstock-search-probe";
import { verifyShutterstockSubscription } from "../apps/api/src/shutterstock-reference";

export function inspectFreeShutterstockSubscriptions(
  response: unknown,
  now = Date.now(),
) {
  const data =
    response !== null && typeof response === "object" && "data" in response
      ? (response as { data: unknown }).data
      : null;
  if (!Array.isArray(data)) return [];
  const eligible: string[] = [];
  for (const row of data.slice(0, 100)) {
    const id = row?.id;
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) continue;
    try {
      verifyShutterstockSubscription(
        { data: [row] },
        { subscriptionId: id, collection: "free" },
        now,
      );
      eligible.push(id);
    } catch {
      /* Only normalized readiness status leaves this process. */
    }
  }
  return [...new Set(eligible)];
}

export function freeShutterstockSubscriptionStatus(
  response: unknown,
  now = Date.now(),
) {
  if (
    response === null ||
    typeof response !== "object" ||
    !Array.isArray((response as { data?: unknown }).data)
  )
    return "source_unavailable";
  if ((response as { data: unknown[] }).data.length === 0)
    return "subscription_required";
  const count = inspectFreeShutterstockSubscriptions(response, now).length;
  return count === 1
    ? "free_subscription_verified"
    : count > 1
      ? "subscription_selection_required"
      : "free_subscription_unverified";
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.info(
      "Usage: bun run shutterstock:preflight\nAt most one GET /v2/user/subscriptions. Reads the ignored apps/api/.dev.vars Access Token; never accepts credentials in arguments. No licenses, downloads, inference, deployment or setting changes. Readiness is not AI-use authorization. Report: ignored .tmp/shutterstock-preflight.json",
    );
    return;
  }
  if (args.length) throw new Error("Unknown option; use --help.");
  const root = resolve(import.meta.dir, "..");
  const vars = resolve(root, "apps/api/.dev.vars");
  const output = resolve(root, ".tmp/shutterstock-preflight.json");
  for (const path of [vars, output]) {
    const ignored = Bun.spawn(["git", "check-ignore", "--quiet", path], {
      cwd: root,
      stdout: "ignore",
      stderr: "ignore",
    });
    if ((await ignored.exited) !== 0)
      throw new Error("Credential/report paths must be ignored.");
  }
  const content = (await Bun.file(vars).exists())
    ? await Bun.file(vars).text()
    : "";
  const token = parseShutterstockProbeVariable(
    content,
    "SHUTTERSTOCK_ACCESS_TOKEN",
  );
  let status = "token_required",
    requests = 0;
  let subscriptions: string[] = [];
  if (token && /^[\x21-\x7e]{16,4096}$/.test(token)) {
    requests++;
    const response = await fetch(
      "https://api.shutterstock.com/v2/user/subscriptions",
      {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(12000),
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "User-Agent":
            "PhotoStudioPreflight/1.0 (+https://photo-studio.cloby.co)",
        },
      },
    );
    if (response.status === 401 || response.status === 403)
      status = "auth_failed";
    else if (response.status === 429) status = "rate_limited";
    else if (!response.ok) status = "source_unavailable";
    else {
      const raw = await response.text();
      if (raw.length > 512 * 1024)
        throw new Error("Subscription response exceeded limit.");
      const parsed: unknown = JSON.parse(raw);
      subscriptions = inspectFreeShutterstockSubscriptions(parsed);
      status = freeShutterstockSubscriptionStatus(parsed);
    }
  }
  await Bun.write(
    output,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        status,
        apiGets: requests,
        freeSubscriptionIds: subscriptions,
        activationReady: false,
        aiRightsVerified: false,
        licenses: 0,
        downloads: 0,
        aiCalls: 0,
      },
      null,
      2,
    ),
  );
  console.info(
    `Shutterstock preflight: ${status}; ${requests} GET; ${subscriptions.length} verified free subscription(s). License/download/AI/production changes: 0. Private report saved.`,
  );
  if (status !== "free_subscription_verified") process.exitCode = 2;
}
if (import.meta.main)
  main().catch(() => {
    console.error(
      "Shutterstock preflight failed safely; sensitive details suppressed. No license or AI operation attempted.",
    );
    process.exitCode = 1;
  });
