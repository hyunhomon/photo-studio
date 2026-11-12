import { resolve } from "node:path";
import { ProviderError } from "../packages/ai/src/provider";
import { mockAnalysisFixture } from "../packages/ai/src/fixtures";
import { normalizeImage } from "../apps/api/src/images";
import {
  verifyFreeShutterstockSource,
  type ShutterstockFetch,
} from "../apps/api/src/shutterstock-reference";
import { inspectFreeShutterstockSubscriptions } from "./shutterstock-preflight";
import { parseShutterstockProbeVariable } from "./shutterstock-search-probe";

// This CLI never installs settings, purchases a subscription or calls AI.
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || (args.length === 1 && args[0] === "--help")) {
    console.info(
      "Usage: bun run shutterstock:license:verify --execute-free-license\nExplicitly license ONE image from a verified free platform subscription and download/decode it locally. Requires Access Token in ignored apps/api/.dev.vars. One durable claim/grant; no automatic reissue after uncertain outcomes. No paid plan, AI, production settings or customer data operations. Receipts/images remain ignored under .tmp/shutterstock-license-probe/.",
    );
    return;
  }
  if (args.length !== 1 || args[0] !== "--execute-free-license")
    throw new Error("Unknown option; use --help.");
  const root = resolve(import.meta.dir, "..");
  const vars = resolve(root, "apps/api/.dev.vars");
  const receipt = resolve(root, ".tmp/shutterstock-license-probe/receipt.json");
  const imageFile = resolve(
    root,
    ".tmp/shutterstock-license-probe/licensed-reference.jpg",
  );
  for (const path of [vars, receipt, imageFile]) {
    const check = Bun.spawn(["git", "check-ignore", "--quiet", path], {
      cwd: root,
      stdout: "ignore",
      stderr: "ignore",
    });
    if ((await check.exited) !== 0)
      throw new Error("Private paths must be ignored.");
  }
  if (await Bun.file(receipt).exists()) {
    const previous = await Bun.file(receipt).json();
    if (previous.status === "verified") {
      console.info(
        "PASS: an existing verified source receipt is retained. No new requests or license issued.",
      );
      return;
    }
    throw new Error(
      "An earlier license attempt requires reconciliation; no new license will be issued.",
    );
  }
  const token = parseShutterstockProbeVariable(
    await Bun.file(vars).text(),
    "SHUTTERSTOCK_ACCESS_TOKEN",
  );
  if (!token || !/^[\x21-\x7e]{16,4096}$/.test(token))
    throw new Error("Access Token required.");
  const counts = {
    apiGets: 0,
    licensePosts: 0,
    redownloadPosts: 0,
    mediaDownloads: 0,
    aiCalls: 0,
  };
  const transport: ShutterstockFetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? "GET";
    if (url.origin === "https://api.shutterstock.com") {
      if (method === "GET") counts.apiGets++;
      else if (method === "POST" && url.pathname === "/v2/images/licenses") {
        if (++counts.licensePosts > 1)
          throw new Error("Duplicate license blocked.");
      } else if (
        method === "POST" &&
        /^\/v2\/images\/licenses\/[A-Za-z0-9_-]+\/downloads$/.test(url.pathname)
      )
        counts.redownloadPosts++;
      else throw new Error("Non-source operation blocked.");
    } else if (
      url.origin === "https://download.shutterstock.com" &&
      method === "GET"
    )
      counts.mediaDownloads++;
    else throw new Error("Non-source host blocked.");
    const result = await fetch(input, init);
    if (method === "POST" && url.pathname === "/v2/images/licenses") {
      // Private reconciliation evidence, including the initial expiring link.
      // Never log this response and never reissue a license to recover a link.
      await Bun.write(
        resolve(
          root,
          ".tmp/shutterstock-license-probe/license-response-private.json",
        ),
        await result.clone().text(),
      );
    }
    return result;
  };
  const response = await transport(
    "https://api.shutterstock.com/v2/user/subscriptions",
    {
      method: "GET",
      redirect: "manual",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "User-Agent":
          "PhotoStudioFreeLicenseProbe/1.0 (+https://photo-studio.cloby.co)",
      },
      signal: AbortSignal.timeout(12000),
    },
  );
  if (!response.ok) throw new Error("Subscription read failed.");
  const subscriptions = inspectFreeShutterstockSubscriptions(
    await response.json(),
  );
  const subscriptionId = subscriptions[0];
  if (subscriptions.length !== 1 || !subscriptionId)
    throw new Error(
      "One verified free subscription is required; no license attempted.",
    );
  let state: Record<string, unknown> | undefined;
  try {
    const candidate = await verifyFreeShutterstockSource(
      { ...mockAnalysisFixture, garmentType: "hoodie" },
      { accessToken: token, subscriptionId },
      {
        fetch: transport,
        customerRef: `source-probe-${crypto.randomUUID()}`,
        beforeLicense: async (intent) => {
          state = {
            status: "claimed",
            intent,
            createdAt: new Date().toISOString(),
            aiUseAuthorized: false,
          };
          await Bun.write(receipt, JSON.stringify(state, null, 2));
        },
        onLicensed: async (grant) => {
          state = { ...state, status: "licensed", grant };
          await Bun.write(receipt, JSON.stringify(state, null, 2));
        },
      },
    );
    await Bun.write(imageFile, candidate.bytes);
    const normalized = await normalizeImage(
      candidate.bytes,
      candidate.declaredMime,
      1024,
    );
    if (normalized.width < 300 || normalized.height < 300)
      throw new Error("Decoded image dimensions invalid.");
    await Bun.write(
      resolve(root, ".tmp/shutterstock-license-probe/normalized-reference.png"),
      normalized.bytes,
    );
    state = {
      ...state,
      status: "verified",
      verifiedAt: new Date().toISOString(),
      bytes: candidate.bytes.length,
      width: normalized.width,
      height: normalized.height,
      sourcePage: candidate.sourcePage,
      actualCostUsd: candidate.actualCostUsd,
      counts,
    };
    await Bun.write(receipt, JSON.stringify(state, null, 2));
    console.info(
      `PASS: one free license issued; JPEG downloaded and decoded (${normalized.width}x${normalized.height}); ${candidate.bytes.length} bytes. AI/paid-plan calls: 0. Private receipt retained.`,
    );
    console.info(JSON.stringify(counts));
  } catch (error) {
    if (state)
      await Bun.write(
        receipt,
        JSON.stringify(
          {
            ...state,
            validationError:
              error instanceof ProviderError ? error.code : "VALIDATION_FAILED",
            counts,
          },
          null,
          2,
        ),
      );
    throw error;
  }
}
if (import.meta.main)
  main().catch((error: unknown) => {
    console.error(
      error instanceof ProviderError
        ? `Source verification stopped: ${error.code}. No automatic retry.`
        : "Source verification failed safely; sensitive details suppressed. No automatic retry.",
    );
    process.exitCode = 1;
  });
