import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const api = "https://api.shutterstock.com";
const root = resolve(import.meta.dir, "..");
const tokenFile = resolve(root, "apps/api/.dev.vars");
const reportFile = resolve(root, ".tmp/shutterstock-search-report.json");
const userAgent =
  "PhotoStudioReferenceProbe/1.0 (+https://photo-studio.cloby.co)";
const garments = ["hoodie", "shirt", "coat"] as const;
type Json = Record<string, unknown>;
type ProbeStatus =
  "completed" | "rate_limited" | "auth_failed" | "source_unavailable";
export type ProbeFetch = (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) => Promise<Response>;
export interface SearchProbeSample {
  sourcePage: string;
  description: string;
  previewUrl: string | null;
  attribution: "Shutterstock";
  modelRelease: "confirmed" | "unknown";
  metadataAssessment: "eligible" | "release_unknown";
}
export interface SearchProbeQuery {
  garment: (typeof garments)[number];
  mode: "production" | "broader_diagnostic";
  query: string;
  totalCount: number | null;
  returnedCount: number;
  checkedDetails: number;
  eligibleCount: number;
  releaseUnknownCount: number;
  rejectedCount: number;
  /** One rejected image can have several reasons; no raw keywords are saved. */
  rejectionReasons: Partial<Record<SearchProbeRejectionReason, number>>;
  samples: SearchProbeSample[];
}
export type SearchProbeRejectionReason =
  | "ID_MISMATCH"
  | "NOT_PHOTOGRAPH"
  | "EDITORIAL_CONTENT"
  | "ILLUSTRATION_CONTENT"
  | "SEXUAL_CONTENT"
  | "INVALID_NEGATIVE_FLAG"
  | "AI_CONTENT"
  | "MODEL_RELEASE_FALSE"
  | "MODEL_RELEASE_INVALID"
  | "MODEL_COUNT_INVALID"
  | "EXPLICIT_MINOR_TERMS"
  | "AMBIGUOUS_AGE_TERMS";
export interface ShutterstockSearchReport {
  version: 1;
  generatedAt: string;
  status: ProbeStatus;
  requestCount: number;
  maxRequests: 10;
  metadataOnly: true;
  authentication: "bearer" | "basic";
  licensed: false;
  aiProcessingVerified: false;
  adultAgeEvidence: "provider_search_filter_20s_only";
  note: string;
  subscriptions: {
    status:
      "available" | "denied" | "unavailable" | "not_checked_requires_oauth";
    count: number | null;
    licenseCounts: Record<string, number>;
  };
  searches: SearchProbeQuery[];
  diagnostics: {
    operation: "subscriptions" | "search" | "details";
    httpStatus: number | null;
    providerCode: "VALIDATION_INVALID_TYPE" | null;
  }[];
}
class ProbeFailure extends Error {
  constructor(
    public code: ProbeStatus | "configuration_required" | "report_not_ignored",
  ) {
    super(code);
  }
}
const object = (v: unknown): Json | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null;
const imageId = (v: unknown): v is string =>
  typeof v === "string" && /^[1-9][0-9]{0,29}$/.test(v);
const count = (v: unknown): number | null =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
function validToken(value: unknown): value is string {
  return typeof value === "string" && /^[\x21-\x7e]{16,4096}$/.test(value);
}

/** Only the one named variable is parsed. No evaluation or dotenv expansion. */
export function parseShutterstockProbeToken(contents: string): string | null {
  const value = parseShutterstockProbeVariable(
    contents,
    "SHUTTERSTOCK_ACCESS_TOKEN",
  );
  return validToken(value) ? value : null;
}
export function parseShutterstockProbeVariable(
  contents: string,
  name:
    | "SHUTTERSTOCK_ACCESS_TOKEN"
    | "SHUTTERSTOCK_CONSUMER_KEY"
    | "SHUTTERSTOCK_CONSUMER_SECRET",
): string | null {
  const values = contents.split(/\r?\n/).flatMap((line) => {
    const match = line.match(
      /^\s*(?:export\s+)?(SHUTTERSTOCK_ACCESS_TOKEN|SHUTTERSTOCK_CONSUMER_KEY|SHUTTERSTOCK_CONSUMER_SECRET)\s*=\s*(.*?)\s*$/,
    );
    if (!match || match[1] !== name) return [];
    const raw = match[2] ?? "";
    let value = raw;
    if (raw.startsWith('"')) {
      const quoted = raw.match(/^("(?:[^"\\]|\\.)*")\s*(?:#.*)?$/);
      if (!quoted?.[1]) return [null];
      try {
        value = JSON.parse(quoted[1]) as string;
      } catch {
        return [null];
      }
    } else if (raw.startsWith("'")) {
      const quoted = raw.match(/^'([^']*)'\s*(?:#.*)?$/);
      if (quoted?.[1] === undefined) return [null];
      value = quoted[1];
    } else value = raw.replace(/\s+#.*$/, "").trim();
    return [/^[\x21-\x7e]{8,4096}$/.test(value) ? value : null];
  });
  return values.length === 1 ? (values[0] ?? null) : null;
}

async function limitedJson(response: Response): Promise<Json> {
  const declared = response.headers.get("content-length");
  if (
    declared &&
    (!/^[0-9]+$/.test(declared) || Number(declared) > 512 * 1024)
  ) {
    await response.body?.cancel();
    throw new ProbeFailure("source_unavailable");
  }
  if (!response.body) throw new ProbeFailure("source_unavailable");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let length = 0;
  let text = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.length;
      if (length > 512 * 1024) throw new ProbeFailure("source_unavailable");
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    const parsed = object(JSON.parse(text));
    if (!parsed) throw new ProbeFailure("source_unavailable");
    return parsed;
  } catch {
    await reader.cancel().catch(() => {});
    throw new ProbeFailure("source_unavailable");
  } finally {
    reader.releaseLock();
  }
}

function previewUrl(details: Json, id: string): string | null {
  const assets = object(details.assets);
  for (const name of ["preview_1000", "preview"] as const) {
    const value = object(assets?.[name])?.url;
    if (typeof value !== "string" || value.length > 2000) continue;
    try {
      const url = new URL(value);
      if (
        url.protocol !== "https:" ||
        url.port ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        continue;
      if (!url.pathname.endsWith(".jpg") || !url.pathname.includes(id))
        continue;
      const official =
        (url.hostname === "ak.picdn.net" &&
          url.pathname.startsWith(
            `/shutterstock/photos/${id}/watermark_1000/`,
          )) ||
        (url.hostname === "image.shutterstock.com" &&
          /^\/(display_pic_with_logo|image-photo|z)\//.test(url.pathname)) ||
        (/^thumb[0-9]+\.shutterstock\.com$/.test(url.hostname) &&
          /^\/thumb_(small|large)\//.test(url.pathname));
      if (official) return url.toString();
    } catch {
      /* Skip malformed or noncanonical public previews. */
    }
  }
  return null;
}

function assessment(
  details: Json,
  id: string,
): {
  status: "eligible" | "release_unknown" | "rejected";
  reasons: SearchProbeRejectionReason[];
} {
  const reasons: SearchProbeRejectionReason[] = [];
  const words = [
    details.description,
    ...(Array.isArray(details.keywords) ? details.keywords : []),
  ]
    .filter((v): v is string => typeof v === "string")
    .join(" ");
  if (details.id !== id) reasons.push("ID_MISMATCH");
  if (details.media_type !== "image" || details.image_type !== "photo")
    reasons.push("NOT_PHOTOGRAPH");
  for (const [value, code] of [
    [details.is_editorial, "EDITORIAL_CONTENT"],
    [details.is_illustration, "ILLUSTRATION_CONTENT"],
    [details.is_adult, "SEXUAL_CONTENT"],
  ] as const) {
    if (value === true) reasons.push(code);
    else if (value !== undefined && value !== false)
      reasons.push("INVALID_NEGATIVE_FLAG");
  }
  if (
    details.ai_ip_review ||
    /\b(ai[- ]generated|generative ai|3d render)\b/i.test(words)
  )
    reasons.push("AI_CONTENT");
  if (details.has_model_release === false) reasons.push("MODEL_RELEASE_FALSE");
  else if (
    details.has_model_release !== undefined &&
    details.has_model_release !== true
  )
    reasons.push("MODEL_RELEASE_INVALID");
  if (
    details.models !== undefined &&
    (!Array.isArray(details.models) || details.models.length !== 1)
  )
    reasons.push("MODEL_COUNT_INVALID");
  if (
    /\b(child(?:ren)?|teen(?:age(?:r)?)?|baby|toddler|infant|schoolgirl|schoolboy)\b/i.test(
      words,
    )
  )
    reasons.push("EXPLICIT_MINOR_TERMS");
  // Keep the current production rejection policy intact, but distinguish these
  // ambiguous tags so an adult-filter false negative can be diagnosed honestly.
  if (/\b(boy|girl)\b/i.test(words)) reasons.push("AMBIGUOUS_AGE_TERMS");
  return {
    status: reasons.length
      ? "rejected"
      : details.has_model_release === true
        ? "eligible"
        : "release_unknown",
    reasons: [...new Set(reasons)],
  };
}

/** GET-only viability probe. Never licenses, downloads an image, persists credentials or calls AI. */
export async function probeShutterstockSearch(
  credential: string | { consumerKey: string; consumerSecret: string },
  options: { fetch?: ProbeFetch; now?: () => number } = {},
): Promise<ShutterstockSearchReport> {
  const isBearer = typeof credential === "string";
  if (
    isBearer
      ? !validToken(credential)
      : typeof credential.consumerKey !== "string" ||
        typeof credential.consumerSecret !== "string" ||
        !/^[\x21-\x39\x3b-\x7e]{8,4096}$/.test(credential.consumerKey) ||
        !/^[\x21-\x7e]{8,4096}$/.test(credential.consumerSecret)
  )
    throw new ProbeFailure("configuration_required");
  const authorization = isBearer
    ? `Bearer ${credential}`
    : `Basic ${btoa(`${credential.consumerKey}:${credential.consumerSecret}`)}`;
  const secretValues = isBearer
    ? [credential]
    : [
        credential.consumerKey,
        credential.consumerSecret,
        authorization.slice(6),
      ];
  const report: ShutterstockSearchReport = {
    version: 1,
    generatedAt: new Date((options.now ?? Date.now)()).toISOString(),
    status: "completed",
    requestCount: 0,
    maxRequests: 10,
    metadataOnly: true,
    authentication: isBearer ? "bearer" : "basic",
    licensed: false,
    aiProcessingVerified: false,
    adultAgeEvidence: "provider_search_filter_20s_only",
    note: "Metadata and optional watermarked previews only. No license, image download, AI use permission or visual/model-wearing quality is verified by this report.",
    subscriptions: { status: "unavailable", count: null, licenseCounts: {} },
    searches: [],
    diagnostics: [],
  };
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  const budget = AbortSignal.timeout(60_000);
  async function get(path: string) {
    if (
      report.requestCount >= 10 ||
      !/^\/v2\/(user\/subscriptions|images\/search(?:\?.*)?|images\/[1-9][0-9]{0,29}\?view=full)$/.test(
        path,
      )
    )
      throw new ProbeFailure("source_unavailable");
    report.requestCount++;
    const operation = path.startsWith("/v2/user/")
      ? "subscriptions"
      : path.startsWith("/v2/images/search?")
        ? "search"
        : "details";
    let response: Response;
    try {
      response = await fetcher(`${api}${path}`, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.any([budget, AbortSignal.timeout(12_000)]),
        headers: {
          Authorization: authorization,
          Accept: "application/json",
          "User-Agent": userAgent,
        },
      });
    } catch {
      report.diagnostics.push({
        operation,
        httpStatus: null,
        providerCode: null,
      });
      throw new ProbeFailure("source_unavailable");
    }
    if (!response.ok || response.redirected) {
      // Only this code is explicitly illustrated by the current official
      // OpenAPI. Unknown provider strings and full messages are never retained.
      let providerCode: "VALIDATION_INVALID_TYPE" | null = null;
      if (response.status >= 400) {
        try {
          const error = await limitedJson(response);
          const codes = [
            error.code,
            ...(Array.isArray(error.errors)
              ? error.errors.map((value) => object(value)?.code)
              : []),
          ];
          if (codes.includes("VALIDATION_INVALID_TYPE"))
            providerCode = "VALIDATION_INVALID_TYPE";
        } catch {
          /* HTTP status remains useful when the error shape is unknown. */
        }
      } else await response.body?.cancel();
      report.diagnostics.push({
        operation,
        httpStatus: response.status,
        providerCode,
      });
      if (response.status === 429) throw new ProbeFailure("rate_limited");
      if (response.status === 401 || response.status === 403)
        throw new ProbeFailure("auth_failed");
      throw new ProbeFailure("source_unavailable");
    }
    return limitedJson(response);
  }
  try {
    if (!isBearer) report.subscriptions.status = "not_checked_requires_oauth";
    else
      try {
        const subscriptions = await get("/v2/user/subscriptions");
        if (!Array.isArray(subscriptions.data))
          throw new ProbeFailure("source_unavailable");
        const list = subscriptions.data;
        report.subscriptions.status = "available";
        report.subscriptions.count = list.length;
        for (const row of list) {
          const license = object(row)?.license;
          const key =
            typeof license === "string" &&
            ["standard", "enhanced", "editorial", "platform"].includes(license)
              ? license
              : "other";
          report.subscriptions.licenseCounts[key] =
            (report.subscriptions.licenseCounts[key] ?? 0) + 1;
        }
      } catch (error) {
        if (error instanceof ProbeFailure && error.code === "rate_limited")
          throw error;
        // Read/search-only tokens may lack purchases.view. Search can still work.
        report.subscriptions.status =
          error instanceof ProbeFailure && error.code === "auth_failed"
            ? "denied"
            : "unavailable";
      }
    async function searchQuery(
      garment: (typeof garments)[number],
      mode: SearchProbeQuery["mode"],
    ) {
      const query =
        mode === "production"
          ? `adult model wearing ${garment} fashion catalog NOT children NOT teenager`
          : `${garment} fashion model`;
      const params = new URLSearchParams({
        query,
        image_type: "photo",
        license: "commercial",
        people_number: "1",
        people_model_released: "true",
        people_age: "20s",
        safe: "true",
        keyword_safe_search: "true",
        orientation: "vertical",
        view: "full",
        per_page: "5",
        sort: "relevance",
      });
      const search = await get(`/v2/images/search?${params}`);
      if (!Array.isArray(search.data) || count(search.total_count) === null)
        throw new ProbeFailure("source_unavailable");
      const results = search.data.slice(0, 5);
      const summary: SearchProbeQuery = {
        garment,
        mode,
        query,
        totalCount: count(search.total_count),
        returnedCount: results.length,
        checkedDetails: 0,
        eligibleCount: 0,
        releaseUnknownCount: 0,
        rejectedCount: 0,
        rejectionReasons: {},
        samples: [],
      };
      report.searches.push(summary);
      for (const candidate of results) {
        if (summary.checkedDetails >= (mode === "production" ? 2 : 1)) break;
        const id = object(candidate)?.id;
        if (!imageId(id)) continue;
        const details = await get(`/v2/images/${id}?view=full`);
        summary.checkedDetails++;
        const evaluated = assessment(details, id);
        const status = evaluated.status;
        if (status === "rejected") {
          summary.rejectedCount++;
          for (const reason of evaluated.reasons)
            summary.rejectionReasons[reason] =
              (summary.rejectionReasons[reason] ?? 0) + 1;
          continue;
        }
        if (status === "eligible") summary.eligibleCount++;
        else summary.releaseUnknownCount++;
        if (
          !summary.samples.length ||
          (status === "eligible" &&
            summary.samples[0]?.metadataAssessment === "release_unknown")
        ) {
          let description =
            typeof details.description === "string" ? details.description : "";
          for (const secret of secretValues)
            description = description.split(secret).join("[redacted]");
          summary.samples = [
            {
              sourcePage: `https://www.shutterstock.com/image-photo/${id}`,
              description: description
                .replace(/<[^>]*>/g, " ")
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 100),
              previewUrl:
                previewUrl(details, id) ??
                previewUrl(object(candidate) ?? {}, id),
              attribution: "Shutterstock",
              modelRelease: status === "eligible" ? "confirmed" : "unknown",
              metadataAssessment: status,
            },
          ];
        }
      }
    }
    for (const garment of garments) await searchQuery(garment, "production");
    if (
      report.searches.every(
        (search) => search.totalCount === 0 && search.returnedCount === 0,
      )
    )
      for (const garment of garments)
        await searchQuery(garment, "broader_diagnostic");
  } catch (error) {
    report.status =
      error instanceof ProbeFailure &&
      ["rate_limited", "auth_failed", "source_unavailable"].includes(error.code)
        ? (error.code as ProbeStatus)
        : "source_unavailable";
  }
  return report;
}

async function requireIgnored(path: string) {
  const command = Bun.spawn(["git", "check-ignore", "--quiet", path], {
    cwd: root,
    stdout: "ignore",
    stderr: "ignore",
  });
  if ((await command.exited) !== 0)
    throw new ProbeFailure("report_not_ignored");
}
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.log(
      "Usage: bun scripts/shutterstock-search-probe.ts [--help|--test]\nGET-only: at most 10 requests. Empty production searches may trigger broader diagnostic queries with identical safety filters.\nSet SHUTTERSTOCK_ACCESS_TOKEN or SHUTTERSTOCK_CONSUMER_KEY + SHUTTERSTOCK_CONSUMER_SECRET in the environment or ignored apps/api/.dev.vars.\nNever pass credentials as arguments. Report: .tmp/shutterstock-search-report.json\nNo licensing, image download, AI, database or R2 calls.",
    );
    return;
  }
  if (args.length === 1 && args[0] === "--test") {
    const tests = Bun.spawn(
      [
        process.execPath,
        "test",
        resolve(import.meta.dir, "shutterstock-search-probe.test.ts"),
      ],
      {
        cwd: root,
        stdout: "inherit",
        stderr: "inherit",
      },
    );
    process.exitCode = await tests.exited;
    return;
  }
  if (args.length) throw new ProbeFailure("configuration_required");
  await requireIgnored(reportFile);
  let contents = "";
  const token = process.env.SHUTTERSTOCK_ACCESS_TOKEN;
  if (!token) {
    await requireIgnored(tokenFile);
    if (await Bun.file(tokenFile).exists())
      contents = await Bun.file(tokenFile).text();
  }
  const selectedToken = token ?? parseShutterstockProbeToken(contents);
  const consumerKey =
    process.env.SHUTTERSTOCK_CONSUMER_KEY ??
    parseShutterstockProbeVariable(contents, "SHUTTERSTOCK_CONSUMER_KEY");
  const consumerSecret =
    process.env.SHUTTERSTOCK_CONSUMER_SECRET ??
    parseShutterstockProbeVariable(contents, "SHUTTERSTOCK_CONSUMER_SECRET");
  const credential =
    selectedToken ??
    (consumerKey && consumerSecret ? { consumerKey, consumerSecret } : null);
  if (!credential) throw new ProbeFailure("configuration_required");
  const report = await probeShutterstockSearch(credential);
  await mkdir(resolve(root, ".tmp"), { recursive: true });
  await Bun.write(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `Shutterstock search probe: ${report.status}; ${report.requestCount}/10 GET requests.`,
  );
  for (const search of report.searches)
    console.log(
      `${search.mode}/${search.garment}: total=${search.totalCount ?? "unknown"}; checked=${search.checkedDetails}; eligible=${search.eligibleCount}; release_unknown=${search.releaseUnknownCount}.`,
    );
  for (const search of report.searches)
    if (Object.keys(search.rejectionReasons).length)
      console.log(
        `${search.mode}/${search.garment} rejection reasons: ${JSON.stringify(search.rejectionReasons)}.`,
      );
  for (const diagnostic of report.diagnostics)
    console.log(
      `${diagnostic.operation}: HTTP ${diagnostic.httpStatus ?? "unavailable"}; code=${diagnostic.providerCode ?? "unknown"}.`,
    );
  console.log(
    "Metadata-only report saved to ignored .tmp/shutterstock-search-report.json. No license or AI permission verified.",
  );
  if (report.status !== "completed") process.exitCode = 1;
}
if (import.meta.main)
  main().catch((error: unknown) => {
    const code =
      error instanceof ProbeFailure ? error.code : "source_unavailable";
    console.error(
      code === "configuration_required"
        ? "Set SHUTTERSTOCK_ACCESS_TOKEN or SHUTTERSTOCK_CONSUMER_KEY + SHUTTERSTOCK_CONSUMER_SECRET in the environment or ignored apps/api/.dev.vars; never pass credentials as arguments."
        : code === "report_not_ignored"
          ? "Probe refused: credential/report paths must be git-ignored."
          : "Shutterstock metadata probe failed safely. No paid operation was attempted.",
    );
    process.exitCode = 1;
  });
