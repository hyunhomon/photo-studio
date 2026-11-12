import { ProviderError } from "@photo-studio/ai";
import type { ProductAnalysis } from "@photo-studio/schemas";

// This adapter is deliberately unusable without an operator's separately
// approved Shutterstock AI-reference agreement and platform subscription.
export interface ShutterstockSettingsInput {
  REFERENCE_SOURCE?: string;
  SHUTTERSTOCK_ACCESS_TOKEN?: string;
  SHUTTERSTOCK_SUBSCRIPTION_ID?: string;
  SHUTTERSTOCK_LICENSE?: string;
  SHUTTERSTOCK_AI_REFERENCE_APPROVED?: string;
  SHUTTERSTOCK_AGREEMENT_VERSION?: string;
}
export interface ShutterstockSettings {
  accessToken: string;
  subscriptionId: string;
  license: "platform";
  agreementVersion: string;
}
export interface ShutterstockLicenseIntent {
  mediaId: string;
  subscriptionId: string;
  license: "platform";
  size: "medium";
  query: string;
  agreementVersion: string;
  customerRef: string;
}
export interface ShutterstockLicenseGrant {
  mediaId: string;
  licenseId: string;
  subscriptionId: string;
  license: "platform";
  size: "medium";
  agreementVersion: string;
  licensedAt: number;
  // Shutterstock documents link expiry, not expiry of the licensed rights.
  expiresAt: null;
}
export interface ShutterstockCandidate {
  bytes: Uint8Array;
  declaredMime: "image/jpeg";
  query: string;
  sourcePage: string;
  creator: string;
  title: string;
  license: "platform";
  licenseUrl: string;
  /** Signed download URL: server-only; never include this in a public DTO. */
  mediaUrl: string;
  mediaId: string;
  licenseId: string;
  modelRelease: true;
  commercial: true;
  adultAgeFilter: "20s";
  agreementVersion: string;
  downloadExpiresAt: number;
  actualCostUsd: null;
}
export type ShutterstockFetch = (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) => Promise<Response>;
export interface ShutterstockReferenceOptions {
  fetch?: ShutterstockFetch;
  /** Persist a once-only, conditional claim before the paid POST. */
  beforeLicense: (intent: ShutterstockLicenseIntent) => Promise<void>;
  /** Persist the grant before obtaining or fetching any download URL. */
  onLicensed: (grant: ShutterstockLicenseGrant) => Promise<void>;
  customerRef: string;
  existingLicense?: ShutterstockLicenseGrant;
  now?: () => number;
}

const api = "https://api.shutterstock.com";
const userAgent =
  "PhotoStudioReferenceBot/1.0 (+https://photo-studio.cloby.co)";
const maxImageBytes = 6 * 1024 * 1024;
const maxJsonBytes = 512 * 1024;
type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
const identifier = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const mediaIdentifier = (value: unknown): value is string =>
  typeof value === "string" && /^[1-9][0-9]{0,29}$/.test(value);
const positiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

export function readShutterstockSettings(
  input: ShutterstockSettingsInput,
): ShutterstockSettings {
  if (
    input.REFERENCE_SOURCE !== "shutterstock" ||
    input.SHUTTERSTOCK_LICENSE !== "platform" ||
    !input.SHUTTERSTOCK_ACCESS_TOKEN ||
    !input.SHUTTERSTOCK_SUBSCRIPTION_ID
  )
    throw new ProviderError("SHUTTERSTOCK_NOT_CONFIGURED");
  if (
    input.SHUTTERSTOCK_AI_REFERENCE_APPROVED !== "true" ||
    !input.SHUTTERSTOCK_AGREEMENT_VERSION ||
    !/^[\x20-\x7e]{1,120}$/.test(input.SHUTTERSTOCK_AGREEMENT_VERSION) ||
    !input.SHUTTERSTOCK_AGREEMENT_VERSION.trim()
  )
    throw new ProviderError("SHUTTERSTOCK_AGREEMENT_REQUIRED");
  if (
    !/^[\x21-\x7e]{16,4096}$/.test(input.SHUTTERSTOCK_ACCESS_TOKEN) ||
    !identifier(input.SHUTTERSTOCK_SUBSCRIPTION_ID)
  )
    throw new ProviderError("SHUTTERSTOCK_NOT_CONFIGURED");
  return {
    accessToken: input.SHUTTERSTOCK_ACCESS_TOKEN,
    subscriptionId: input.SHUTTERSTOCK_SUBSCRIPTION_ID,
    license: "platform",
    agreementVersion: input.SHUTTERSTOCK_AGREEMENT_VERSION.trim(),
  };
}

/** Only fixed, generic garment terms leave the app; no user text is searched. */
export function shutterstockReferenceQuery(analysis: ProductAnalysis): string {
  const garment = [
    [/후드|hoodie|hooded/i, "hoodie"],
    [/코트|coat/i, "coat"],
    [/재킷|자켓|jacket|blazer/i, "jacket"],
    [/원피스|드레스|dress/i, "dress"],
    [/스커트|치마|skirt/i, "skirt"],
    [/바지|팬츠|trousers|pants|jeans/i, "trousers"],
    [/니트|스웨터|가디건|knit|sweater|cardigan/i, "knitwear"],
    [/셔츠|티셔츠|shirt|tee/i, "shirt"],
  ].find(([pattern]) => (pattern as RegExp).test(analysis.garmentType))?.[1];
  return `adult model wearing ${garment ?? "casual clothing"} fashion catalog NOT children NOT teenager`;
}

async function bounded(response: Response, max: number): Promise<Uint8Array> {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null &&
    (!/^[0-9]+$/.test(declaredLength) ||
      !Number.isSafeInteger(Number(declaredLength)) ||
      Number(declaredLength) > max)
  ) {
    await response.body?.cancel();
    throw new ProviderError("SHUTTERSTOCK_RESPONSE_TOO_LARGE");
  }
  if (!response.body)
    throw new ProviderError("SHUTTERSTOCK_SOURCE_UNAVAILABLE");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > max)
        throw new ProviderError("SHUTTERSTOCK_RESPONSE_TOO_LARGE");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

async function requestJson(
  fetcher: ShutterstockFetch,
  settings: ShutterstockSettings,
  path: string,
  body?: JsonObject,
  paidLicense = false,
): Promise<JsonObject> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetcher(`${api}${path}`, {
      method: body ? "POST" : "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${settings.accessToken}`,
        Accept: "application/json",
        "User-Agent": userAgent,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok || response.redirected) {
      await response.body?.cancel();
      if (paidLicense) {
        if ([400, 401, 403, 404, 422, 429].includes(response.status))
          throw new ProviderError("SHUTTERSTOCK_LICENSE_REJECTED");
        throw new ProviderError("SHUTTERSTOCK_LICENSE_UNCERTAIN", true);
      }
      throw new ProviderError(
        response.status === 401 || response.status === 403
          ? "SHUTTERSTOCK_AUTH_FAILED"
          : response.status === 429
            ? "SHUTTERSTOCK_RATE_LIMITED"
            : "SHUTTERSTOCK_SOURCE_UNAVAILABLE",
      );
    }
    const result = object(
      JSON.parse(
        new TextDecoder().decode(await bounded(response, maxJsonBytes)),
      ),
    );
    if (!result) throw new Error("invalid shape");
    return result;
  } catch (error) {
    if (error instanceof ProviderError && !paidLicense) throw error;
    if (
      error instanceof ProviderError &&
      error.code === "SHUTTERSTOCK_LICENSE_REJECTED"
    )
      throw error;
    throw new ProviderError(
      paidLicense
        ? "SHUTTERSTOCK_LICENSE_UNCERTAIN"
        : "SHUTTERSTOCK_SOURCE_UNAVAILABLE",
      paidLicense,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function verifySubscription(
  response: JsonObject,
  settings: ShutterstockSettings,
  now: number,
) {
  const subscriptions = Array.isArray(response.data) ? response.data : [];
  const subscription = subscriptions
    .map(object)
    .find((item) => item?.id === settings.subscriptionId);
  const allotment = object(subscription?.allotment);
  const expiration = subscription?.expiration_time;
  const expires = typeof expiration === "string" ? Date.parse(expiration) : NaN;
  const formats = Array.isArray(subscription?.formats)
    ? subscription.formats.map(object)
    : [];
  if (
    subscription?.license !== "platform" ||
    subscription.asset_type !== "images" ||
    !Number.isFinite(expires) ||
    expires <= now ||
    !positiveInteger(allotment?.downloads_left) ||
    !formats.some(
      (format) =>
        format?.media_type === "image" &&
        format.format === "jpg" &&
        format.size === "medium",
    )
  )
    throw new ProviderError("SHUTTERSTOCK_SUBSCRIPTION_INVALID");
  const metadata = object(subscription.metadata);
  if (
    metadata &&
    Object.entries(metadata).some(
      ([key, value]) =>
        object(value)?.is_required === true && key !== "customer_id",
    )
  )
    throw new ProviderError("SHUTTERSTOCK_SUBSCRIPTION_INVALID");
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string"
    ? value
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max)
    : "";
}
function eligibleImage(details: JsonObject, expectedId: string): boolean {
  const assets = object(details.assets);
  const medium = object(assets?.medium_jpg);
  // The official full-view example omits these optional booleans and sizes.
  // Explicit contradictory flags still reject a result from our AND-filtered
  // commercial/photo/safe/adult/model-released search. Missing optional fields
  // must not turn every documented response into an ineligible image.
  const optionalFalse = (value: unknown) =>
    value === undefined || value === false;
  const optionalPositiveInteger = (value: unknown, max: number) =>
    value === undefined || (positiveInteger(value) && value <= max);
  const validMedium =
    assets?.medium_jpg === undefined ||
    (medium !== null &&
      (medium.is_licensable === undefined || medium.is_licensable === true) &&
      (medium.format === undefined || medium.format === "jpg") &&
      optionalPositiveInteger(medium.file_size, maxImageBytes) &&
      optionalPositiveInteger(medium.width, 4096) &&
      optionalPositiveInteger(medium.height, 4096) &&
      (!positiveInteger(medium.width) ||
        !positiveInteger(medium.height) ||
        medium.width * medium.height <= 4_000_000));
  const description = [
    cleanText(details.description, 1000),
    ...(Array.isArray(details.keywords) ? details.keywords : []),
  ].join(" ");
  return (
    details.id === expectedId &&
    details.media_type === "image" &&
    details.image_type === "photo" &&
    optionalFalse(details.is_illustration) &&
    optionalFalse(details.is_editorial) &&
    optionalFalse(details.is_adult) &&
    details.has_model_release === true &&
    !details.ai_ip_review &&
    (!Array.isArray(details.models) || details.models.length === 1) &&
    !/\b(child(?:ren)?|teen(?:age(?:r)?)?|baby|toddler|infant|schoolgirl|schoolboy|boy|girl)\b/i.test(
      description,
    ) &&
    !/\b(ai[- ]generated|generative ai|artificial intelligence|synthetic image|3d render)\b/i.test(
      description,
    ) &&
    validMedium
  );
}

function sourcePage(details: JsonObject, mediaId: string): string {
  try {
    const url = new URL(typeof details.url === "string" ? details.url : "");
    if (
      url.protocol === "https:" &&
      url.hostname === "www.shutterstock.com" &&
      !url.port &&
      !url.username &&
      !url.password &&
      /^\/image-photo\/[A-Za-z0-9-]+$/.test(url.pathname) &&
      url.pathname.endsWith(mediaId)
    ) {
      url.search = "";
      url.hash = "";
      return url.toString();
    }
  } catch {
    /* The safe canonical ID page needs no provider-controlled URL. */
  }
  return `https://www.shutterstock.com/image-photo/${mediaId}`;
}

async function download(
  fetcher: ShutterstockFetch,
  value: unknown,
  mediaId: string,
): Promise<Uint8Array> {
  let url: URL;
  try {
    if (typeof value !== "string" || value.length > 4096) throw new Error();
    url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "download.shutterstock.com" ||
      url.port ||
      url.username ||
      url.password ||
      url.hash ||
      !url.pathname.startsWith("/gatekeeper/") ||
      !url.pathname.endsWith(`/shutterstock_${mediaId}.jpg`)
    )
      throw new Error();
  } catch {
    throw new ProviderError("SHUTTERSTOCK_DOWNLOAD_URL_REJECTED");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetcher(url.toString(), {
      redirect: "manual",
      signal: controller.signal,
      headers: { Accept: "image/jpeg", "User-Agent": userAgent },
    });
    if (
      !response.ok ||
      response.redirected ||
      response.headers
        .get("content-type")
        ?.split(";")[0]
        ?.trim()
        .toLowerCase() !== "image/jpeg"
    ) {
      await response.body?.cancel();
      throw new ProviderError("SHUTTERSTOCK_DOWNLOAD_REJECTED");
    }
    const bytes = await bounded(response, maxImageBytes);
    if (
      bytes.length < 4 ||
      bytes[0] !== 0xff ||
      bytes[1] !== 0xd8 ||
      bytes[2] !== 0xff
    )
      throw new ProviderError("SHUTTERSTOCK_DOWNLOAD_REJECTED");
    return bytes;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError("SHUTTERSTOCK_SOURCE_UNAVAILABLE");
  } finally {
    clearTimeout(timeout);
  }
}

/** No request in this function is automatically retried, especially licensing. */
export async function shutterstockReference(
  analysis: ProductAnalysis,
  input: ShutterstockSettingsInput,
  options: ShutterstockReferenceOptions,
): Promise<ShutterstockCandidate> {
  const settings = readShutterstockSettings(input);
  if (
    !/^[A-Za-z0-9_-]{16,128}$/.test(options.customerRef) ||
    typeof options.beforeLicense !== "function" ||
    typeof options.onLicensed !== "function"
  )
    throw new ProviderError("SHUTTERSTOCK_POLICY_CHANGED");
  const transport = options.fetch ?? globalThis.fetch.bind(globalThis);
  const budget = AbortSignal.timeout(70_000);
  const fetcher: ShutterstockFetch = (url, init = {}) =>
    transport(url, {
      ...init,
      signal: init.signal ? AbortSignal.any([budget, init.signal]) : budget,
    });
  const now = options.now ?? Date.now;
  const query = shutterstockReferenceQuery(analysis);
  verifySubscription(
    await requestJson(fetcher, settings, "/v2/user/subscriptions"),
    settings,
    now(),
  );
  let details: JsonObject | null = null;
  let mediaId = "";
  let grant = options.existingLicense;
  let searchId: string | undefined;
  if (grant) {
    if (
      !mediaIdentifier(grant.mediaId) ||
      !identifier(grant.licenseId) ||
      grant.subscriptionId !== settings.subscriptionId ||
      grant.agreementVersion !== settings.agreementVersion ||
      grant.license !== "platform" ||
      grant.size !== "medium" ||
      !Number.isSafeInteger(grant.licensedAt) ||
      grant.licensedAt <= 0 ||
      grant.expiresAt !== null
    )
      throw new ProviderError("SHUTTERSTOCK_POLICY_CHANGED");
    mediaId = grant.mediaId;
    details = await requestJson(
      fetcher,
      settings,
      `/v2/images/${mediaId}?view=full`,
    );
    if (!eligibleImage(details, mediaId))
      throw new ProviderError("SHUTTERSTOCK_NO_ELIGIBLE_IMAGE");
  } else {
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
    const search = await requestJson(
      fetcher,
      settings,
      `/v2/images/search?${params}`,
    );
    if (identifier(search.search_id)) searchId = search.search_id;
    const candidates = Array.isArray(search.data)
      ? search.data.slice(0, 5)
      : [];
    for (const candidate of candidates) {
      const id = object(candidate)?.id;
      if (!mediaIdentifier(id)) continue;
      const result = await requestJson(
        fetcher,
        settings,
        `/v2/images/${id}?view=full`,
      );
      if (!eligibleImage(result, id)) continue;
      details = result;
      mediaId = id;
      break;
    }
    if (!details) throw new ProviderError("SHUTTERSTOCK_NO_ELIGIBLE_IMAGE");
    const intent: ShutterstockLicenseIntent = {
      mediaId,
      subscriptionId: settings.subscriptionId,
      license: "platform",
      size: "medium",
      query,
      agreementVersion: settings.agreementVersion,
      customerRef: options.customerRef,
    };
    await options.beforeLicense(intent);
    const licensed = await requestJson(
      fetcher,
      settings,
      "/v2/images/licenses",
      {
        images: [
          {
            image_id: mediaId,
            subscription_id: settings.subscriptionId,
            size: "medium",
            format: "jpg",
            price: 0,
            metadata: { customer_id: options.customerRef },
            ...(searchId ? { search_id: searchId } : {}),
          },
        ],
      },
      true,
    );
    const rows = Array.isArray(licensed.data) ? licensed.data : [];
    const row = object(rows[0]);
    if (
      rows.length !== 1 ||
      row?.image_id !== mediaId ||
      !identifier(row.license_id) ||
      row.error ||
      (Array.isArray(licensed.errors) && licensed.errors.length > 0)
    )
      throw new ProviderError("SHUTTERSTOCK_LICENSE_UNCERTAIN", true);
    grant = {
      mediaId,
      licenseId: row.license_id,
      subscriptionId: settings.subscriptionId,
      license: "platform",
      size: "medium",
      agreementVersion: settings.agreementVersion,
      licensedAt: now(),
      expiresAt: null,
    };
    try {
      await options.onLicensed(grant);
    } catch {
      throw new ProviderError("SHUTTERSTOCK_LICENSE_UNCERTAIN", true);
    }
  }
  const link = await requestJson(
    fetcher,
    settings,
    `/v2/images/licenses/${grant.licenseId}/downloads`,
    { size: "medium" },
  );
  const downloadExpiresAt = now() + 8 * 60 * 60 * 1000;
  const bytes = await download(fetcher, link.url, mediaId);
  return {
    bytes,
    declaredMime: "image/jpeg",
    query,
    sourcePage: sourcePage(details, mediaId),
    creator: cleanText(object(details.contributor)?.name, 160),
    title: cleanText(details.description, 240) || "Fashion photograph",
    license: "platform",
    licenseUrl: "https://www.shutterstock.com/license",
    mediaUrl: typeof link.url === "string" ? link.url : "",
    mediaId,
    licenseId: grant.licenseId,
    modelRelease: true,
    commercial: true,
    adultAgeFilter: "20s",
    agreementVersion: settings.agreementVersion,
    downloadExpiresAt,
    actualCostUsd: null,
  };
}
