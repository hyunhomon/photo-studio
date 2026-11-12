import { and, createDb, eq, referenceRetrievals } from "@photo-studio/db";
import { ProviderError } from "@photo-studio/ai";
import type {
  AutomaticReferenceDto,
  ProductAnalysis,
} from "@photo-studio/schemas";
import type { Env } from "./env";
import type { JobRow } from "./pipeline";
import { normalizeImage } from "./images";
import { queueObject, clearObjectQueue, deleteObject } from "./storage";
import { hash } from "./crypto";

export const REFERENCE_POLICY_VERSION = "commons-cc0-environment-v1";
const userAgent =
  "PhotoStudioReferenceBot/1.0 (+https://photo-studio.cloby.co)";
const cc0 = "https://creativecommons.org/publicdomain/zero/1.0/";
const mediaHosts = ["upload.wikimedia.org", "thumb.wikimedia.org"];
export type ReferenceFetch = (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) => Promise<Response>;
type Fetcher = ReferenceFetch;
export interface CommonsCandidate {
  bytes: Uint8Array;
  declaredMime: string;
  query: string;
  sourcePage: string;
  creator: string;
  license: "cc0";
  licenseUrl: string;
  title: string;
  mediaUrl: string;
}
function text(value: unknown, max = 500): string {
  return typeof value === "string"
    ? value
        .replace(/<[^>]*>/g, " ")
        .replace(/&[^;]{1,12};/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max)
    : "";
}
function safeUrl(value: unknown, hosts: string[], prefix: string) {
  if (typeof value !== "string" || value.length > 2000) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !hosts.includes(url.hostname) ||
      !url.pathname.startsWith(prefix)
    )
      return null;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}
export function referenceQueries(
  analysis: ProductAnalysis,
  presetLocation = "",
) {
  if (/창|실내|window|interior|studio/i.test(presetLocation))
    return ["window interior", "concrete stairs"];
  if (
    /코트|재킷|자켓|coat|jacket|니트|knit|스웨터|sweater/i.test(
      analysis.garmentType,
    ) ||
    /wool|cashmere|캐시미어|울\b/i.test(analysis.materialGuess.value)
  )
    return ["window interior", "concrete stairs"];
  if (
    /여름|summer/.test(analysis.seasonGuess.join(" ")) &&
    /원피스|dress|린넨|linen/i.test(
      `${analysis.garmentType} ${analysis.materialGuess.value}`,
    )
  )
    return ["stone courtyard", "concrete stairs"];
  return ["concrete stairs", "stone wall courtyard"];
}
async function bounded(response: Response, max: number) {
  if (
    !response.ok ||
    !response.body ||
    Number(response.headers.get("content-length") ?? 0) > max
  )
    throw new ProviderError("AUTO_REFERENCE_SOURCE_UNAVAILABLE");
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > max)
        throw new ProviderError("AUTO_REFERENCE_IMAGE_TOO_LARGE");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel();
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
function licensedCandidate(page: Record<string, unknown>, query: string) {
  const infos = page.imageinfo as Record<string, unknown>[] | undefined;
  const image = infos?.[0];
  if (!image) return null;
  const meta = image.extmetadata as
    Record<string, { value?: string }> | undefined;
  if (!meta) return null;
  const capture = image.metadata as
    { name?: string; value?: unknown }[] | undefined;
  if (
    !Array.isArray(capture) ||
    !capture.some(
      (m) => m.name === "Make" && typeof m.value === "string" && m.value.trim(),
    ) ||
    !capture.some(
      (m) =>
        m.name === "Model" && typeof m.value === "string" && m.value.trim(),
    )
  )
    return null;
  const license = meta.LicenseShortName?.value ?? "";
  let licenseUrl: URL;
  try {
    licenseUrl = new URL(meta.LicenseUrl?.value ?? "");
  } catch {
    return null;
  }
  if (
    !/^CC0(?:\s|$)/i.test(license) ||
    !["http:", "https:"].includes(licenseUrl.protocol) ||
    licenseUrl.username ||
    licenseUrl.password ||
    licenseUrl.port ||
    licenseUrl.hostname !== "creativecommons.org" ||
    !licenseUrl.pathname.startsWith("/publicdomain/zero/1.0/") ||
    text(meta.Restrictions?.value) ||
    meta.AttributionRequired?.value === "true"
  )
    return null;
  const title = text(page.title),
    description = text(meta.ImageDescription?.value, 2000),
    categories = text(meta.Categories?.value, 4000);
  // Rights metadata is not a model release. Retrieve environment evidence only.
  if (
    /\b(people|person|persons|woman|women|men|man|portrait|portraits|selfie|models|nude|nudes|logo|logos|statue|statues|painting|paintings|illustration|illustrations|rendering|midjourney|dall-e|generative|stable diffusion|AI-generated|AI generated)\b/i.test(
      `${title} ${description} ${categories}`,
    )
  )
    return null;
  if (
    image.mime !== "image/jpeg" ||
    !Number.isInteger(image.thumbwidth) ||
    !Number.isInteger(image.thumbheight) ||
    Number(image.thumbwidth) < 300 ||
    Number(image.thumbwidth) > 1024 ||
    Number(image.thumbheight) < 300 ||
    Number(image.thumbheight) > 1024 ||
    Number(image.thumbwidth) * Number(image.thumbheight) > 2_000_000
  )
    return null;
  const mediaUrl = safeUrl(image.thumburl, mediaHosts, "/wikipedia/commons/");
  const sourcePage = safeUrl(
    image.descriptionurl,
    ["commons.wikimedia.org"],
    "/wiki/File:",
  );
  if (!mediaUrl || !sourcePage) return null;
  const creator = text(meta.Artist?.value);
  if (!creator) return null;
  return {
    query,
    sourcePage,
    creator,
    license: "cc0" as const,
    licenseUrl: cc0,
    title,
    mediaUrl,
  };
}
/** Official, keyless API. Never downloads an arbitrary search-result URL. */
export async function searchCommonsReference(
  queries: string[],
  fetcher: Fetcher = fetch,
): Promise<CommonsCandidate> {
  const deadline = Date.now() + 25000;
  for (const query of queries.slice(0, 2)) {
    const url = new URL("https://commons.wikimedia.org/w/api.php");
    url.search = new URLSearchParams({
      action: "query",
      format: "json",
      generator: "search",
      gsrsearch: `${query} filetype:bitmap incategory:CC-Zero`,
      gsrnamespace: "6",
      gsrlimit: "5",
      prop: "imageinfo",
      iiprop: "url|size|mime|metadata|extmetadata",
      iiurlwidth: "768",
      iiurlheight: "768",
      maxlag: "5",
    }).toString();
    const response = await fetcher(url, {
      headers: { "User-Agent": userAgent, Accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
    });
    if (response.status === 429 || response.status === 503)
      throw new ProviderError("AUTO_REFERENCE_RATE_LIMITED");
    const data = JSON.parse(
      new TextDecoder().decode(await bounded(response, 2_000_000)),
    ) as {
      error?: unknown;
      query?: { pages?: Record<string, Record<string, unknown>> };
    };
    if (data.error)
      throw new ProviderError("AUTO_REFERENCE_SOURCE_UNAVAILABLE");
    const pages = Object.values(data.query?.pages ?? {}).sort(
      (a, b) => Number(a.index ?? 0) - Number(b.index ?? 0),
    );
    for (const page of pages) {
      const candidate = licensedCandidate(page, query);
      if (!candidate) continue;
      const image = await fetcher(candidate.mediaUrl, {
        headers: { "User-Agent": userAgent, Accept: "image/jpeg" },
        redirect: "manual",
        signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
      });
      if (image.status === 429 || image.status === 503)
        throw new ProviderError("AUTO_REFERENCE_RATE_LIMITED");
      if (
        !image.ok ||
        image.headers.get("content-type")?.split(";")[0] !== "image/jpeg"
      )
        continue;
      const bytes = await bounded(image, 6 * 1024 * 1024);
      if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) continue;
      return { ...candidate, bytes, declaredMime: "image/jpeg" };
    }
  }
  throw new ProviderError("AUTO_REFERENCE_NO_ELIGIBLE_IMAGE");
}
function dto(
  row: typeof referenceRetrievals.$inferSelect,
): AutomaticReferenceDto {
  const metadata = JSON.parse(
    row.metadataJson,
  ) as Partial<AutomaticReferenceDto>;
  return {
    id: row.id,
    jobId: row.id,
    assetId: row.assetId,
    status: row.status as AutomaticReferenceDto["status"],
    provider: row.provider as AutomaticReferenceDto["provider"],
    query: row.query,
    sourcePage: metadata.sourcePage ?? null,
    creator: metadata.creator ?? null,
    license: metadata.license ?? null,
    licenseUrl: metadata.licenseUrl ?? null,
    title: metadata.title ?? null,
    failureCode: row.failureCode,
    durationMs: row.durationMs,
    createdAt: row.createdAt,
  };
}
export async function getAutomaticReferences(
  env: Env,
  userId: string,
  productId?: string,
) {
  return (
    await createDb(env.DB)
      .select()
      .from(referenceRetrievals)
      .where(
        and(
          eq(referenceRetrievals.userId, userId),
          productId ? eq(referenceRetrievals.productId, productId) : undefined,
        ),
      )
      .all()
  )
    .map(dto)
    .sort((a, b) => b.createdAt - a.createdAt);
}
export async function ensureAutomaticReference(
  env: Env,
  job: JobRow,
  analysis: ProductAnalysis,
  options: {
    forceLive?: boolean;
    fetch?: Fetcher;
    normalize?: typeof normalizeImage;
  } = {},
): Promise<AutomaticReferenceDto> {
  const owner = await env.DB.prepare(
    "SELECT is_test FROM users WHERE id=? AND status='active'",
  )
    .bind(job.userId)
    .first<{ is_test: number }>();
  if (!owner) throw new ProviderError("JOB_CANCELLED");
  if (
    options.forceLive &&
    (!owner.is_test || JSON.parse(job.requestJson).referenceOnlyProbe !== true)
  )
    throw new ProviderError("FORBIDDEN");
  const db = createDb(env.DB),
    before = (
      await getAutomaticReferences(env, job.userId, job.productId)
    ).find((r) => r.id === job.id);
  if (before) {
    if (before.status === "failed")
      throw new ProviderError(
        before.failureCode ?? "AUTO_REFERENCE_SOURCE_UNAVAILABLE",
      );
    if (before.status === "searching")
      throw new ProviderError("AUTO_REFERENCE_IN_PROGRESS");
    return before;
  }
  const started = Date.now();
  const isMock = Boolean(owner.is_test) && !options.forceLive;
  const request = JSON.parse(job.requestJson) as {
    preset?: { location?: string };
  };
  const queries = referenceQueries(analysis, request.preset?.location);
  const claim = await env.DB.prepare(
    "INSERT OR IGNORE INTO reference_retrievals(id,user_id,product_id,status,provider,query,metadata_json,duration_ms,created_at) SELECT j.id,j.user_id,j.product_id,'searching',?,?,'{}',0,? FROM generation_jobs j JOIN products p ON p.id=j.product_id AND p.user_id=j.user_id JOIN users u ON u.id=j.user_id WHERE j.id=? AND j.user_id=? AND j.status IN ('queued','running') AND p.status='ready' AND u.status='active'",
  )
    .bind(
      isMock ? "mock" : "wikimedia_commons",
      queries[0],
      started,
      job.id,
      job.userId,
    )
    .run();
  if (!claim.meta.changes)
    throw new ProviderError("AUTO_REFERENCE_IN_PROGRESS");
  let key: string | undefined;
  const expectedKey = `${job.userId}/${job.productId}/${job.id}-reference.png`;
  async function storedState() {
    const row = await db
      .select()
      .from(referenceRetrievals)
      .where(
        and(
          eq(referenceRetrievals.id, job.id),
          eq(referenceRetrievals.userId, job.userId),
          eq(referenceRetrievals.productId, job.productId),
        ),
      )
      .get();
    if (row?.status !== "selected") return { row, selected: null };
    const linked =
      row.assetId === job.id &&
      (await env.DB.prepare(
        "SELECT 1 AS n FROM assets WHERE id=? AND user_id=? AND product_id=? AND kind='auto_look_reference' AND r2_key=?",
      )
        .bind(job.id, job.userId, job.productId, expectedKey)
        .first());
    if (!linked) throw new ProviderError("AUTO_REFERENCE_STORAGE_UNCERTAIN");
    return { row, selected: dto(row) };
  }
  async function keepSelected(selected: AutomaticReferenceDto) {
    if (key) {
      try {
        await clearObjectQueue(env, key);
      } catch {
        /* A linked asset is retained by GC even if intent cleanup fails. */
      }
    }
    return selected;
  }
  try {
    if (!isMock) {
      const keyHash = await hash(
        `reference-rate:${Math.floor(Date.now() / 60000)}`,
      );
      const rate = await env.DB.prepare(
        "INSERT INTO rate_limits(key,hits,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 RETURNING hits",
      )
        .bind(keyHash, Date.now() + 60000)
        .first<{ hits: number }>();
      if (!rate || rate.hits > 5)
        throw new ProviderError("AUTO_REFERENCE_RATE_LIMITED");
    }
    let image: Awaited<ReturnType<typeof normalizeImage>>,
      metadata: Record<string, unknown>;
    if (isMock) {
      // Deterministic source copy is synthetic transport evidence, not a found photograph.
      const input = await env.DB.prepare(
        "SELECT r2_key FROM assets WHERE user_id=? AND product_id=? AND kind='input' ORDER BY created_at,id LIMIT 1",
      )
        .bind(job.userId, job.productId)
        .first<{ r2_key: string }>();
      const object = input && (await env.ASSETS.get(input.r2_key));
      if (!object) throw new ProviderError("SOURCE_REQUIRED");
      image = await (options.normalize ?? normalizeImage)(
        new Uint8Array(await object.arrayBuffer()),
        "image/png",
      );
      metadata = {
        title: "Mock · 합성 참조",
        sourcePage: null,
        creator: "Synthetic fixture",
        license: "synthetic",
        licenseUrl: null,
        query: queries[0],
      };
    } else {
      const candidate = await searchCommonsReference(queries, options.fetch);
      image = await (options.normalize ?? normalizeImage)(
        candidate.bytes,
        candidate.declaredMime,
      );
      if (
        image.width < 300 ||
        image.width > 1024 ||
        image.height < 300 ||
        image.height > 1024
      )
        throw new ProviderError("AUTO_REFERENCE_IMAGE_TOO_LARGE");
      metadata = {
        title: candidate.title,
        sourcePage: candidate.sourcePage,
        creator: candidate.creator,
        license: candidate.license,
        licenseUrl: candidate.licenseUrl,
        query: candidate.query,
        sourceMedia: candidate.mediaUrl,
      };
    }
    if (image.bytes.length > 6 * 1024 * 1024)
      throw new ProviderError("AUTO_REFERENCE_IMAGE_TOO_LARGE");
    metadata.policyVersion = REFERENCE_POLICY_VERSION;
    metadata.contentHash = [
      ...new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new Uint8Array(image.bytes).buffer,
        ),
      ),
    ]
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("");
    metadata.verifiedAt = Date.now();
    key = `${job.userId}/${job.productId}/${job.id}-reference.png`;
    await queueObject(env, key);
    await env.ASSETS.put(key, image.bytes, {
      httpMetadata: { contentType: image.mimeType },
    });
    const createdAt = Date.now();
    const result = await env.DB.batch([
      env.DB.prepare(
        "INSERT OR IGNORE INTO assets(id,user_id,product_id,kind,r2_key,mime_type,size_bytes,width,height,created_at) SELECT j.id,j.user_id,j.product_id,'auto_look_reference',?,?,?,?,?,? FROM generation_jobs j JOIN products p ON p.id=j.product_id JOIN users u ON u.id=j.user_id WHERE j.id=? AND j.user_id=? AND j.status IN ('queued','running') AND p.status='ready' AND u.status='active' AND EXISTS(SELECT 1 FROM reference_retrievals r WHERE r.id=j.id AND r.user_id=j.user_id AND r.product_id=j.product_id AND r.status='searching')",
      ).bind(
        key,
        image.mimeType,
        image.bytes.length,
        image.width,
        image.height,
        createdAt,
        job.id,
        job.userId,
      ),
      env.DB.prepare(
        "UPDATE reference_retrievals SET asset_id=id,status='selected',provider=?,query=?,metadata_json=?,duration_ms=? WHERE id=? AND user_id=? AND status='searching' AND EXISTS(SELECT 1 FROM assets a JOIN generation_jobs j ON j.id=a.id WHERE a.id=reference_retrievals.id AND a.user_id=reference_retrievals.user_id AND a.product_id=reference_retrievals.product_id AND a.kind='auto_look_reference' AND j.user_id=a.user_id AND j.product_id=a.product_id AND j.status IN ('queued','running'))",
      ).bind(
        isMock ? "mock" : "wikimedia_commons",
        String(metadata.query),
        JSON.stringify(metadata),
        Date.now() - started,
        job.id,
        job.userId,
      ),
    ]);
    if (!result[1]?.meta.changes) throw new ProviderError("JOB_CANCELLED");
    const persisted = await storedState();
    if (!persisted.selected)
      throw new ProviderError("AUTO_REFERENCE_STORAGE_UNCERTAIN");
    return keepSelected(persisted.selected);
  } catch (error) {
    const code =
      error instanceof ProviderError
        ? error.code
        : "AUTO_REFERENCE_SOURCE_UNAVAILABLE";
    // A lost D1 response does not prove rollback. Confirm ownership and commit
    // before compensating; unreadable state leaves both object and GC intent.
    let persisted: Awaited<ReturnType<typeof storedState>>;
    try {
      persisted = await storedState();
    } catch {
      throw new ProviderError("AUTO_REFERENCE_STORAGE_UNCERTAIN");
    }
    if (persisted.selected) return keepSelected(persisted.selected);
    try {
      const rollback = await env.DB.batch([
        env.DB.prepare(
          "UPDATE reference_retrievals SET status='failed',failure_code=?,duration_ms=? WHERE id=? AND user_id=? AND product_id=? AND status='searching'",
        ).bind(code, Date.now() - started, job.id, job.userId, job.productId),
        env.DB.prepare(
          "DELETE FROM assets WHERE id=? AND user_id=? AND product_id=? AND kind='auto_look_reference' AND r2_key=? AND NOT EXISTS(SELECT 1 FROM reference_retrievals r WHERE r.asset_id=assets.id AND r.status='selected')",
        ).bind(job.id, job.userId, job.productId, expectedKey),
      ]);
      if (persisted.row?.status === "searching" && !rollback[0]?.meta.changes) {
        const latest = await storedState();
        if (latest.selected) return keepSelected(latest.selected);
        if (latest.row?.status === "searching")
          throw new Error("Unconfirmed cleanup");
      }
      const stillLinked = await env.DB.prepare(
        "SELECT 1 AS n FROM assets WHERE r2_key=? LIMIT 1",
      )
        .bind(expectedKey)
        .first();
      if (stillLinked) throw new Error("Linked media is not a rollback target");
    } catch {
      throw new ProviderError("AUTO_REFERENCE_STORAGE_UNCERTAIN");
    }
    if (key) {
      try {
        await deleteObject(env, key);
      } catch {
        /* Known orphan metadata is gone; the private GC intent remains. */
      }
    }
    throw new ProviderError(code);
  }
}
