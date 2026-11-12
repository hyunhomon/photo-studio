import { expect, test } from "bun:test";
import { ProviderError } from "@photo-studio/ai";
import { mockAnalysisFixture } from "../../../packages/ai/src/fixtures";
import {
  readShutterstockSettings,
  shutterstockReference,
  shutterstockReferenceQuery,
  shutterstockReferenceQueries,
  shutterstockCandidatePriority,
  type ShutterstockFetch,
  type ShutterstockLicenseGrant,
  type ShutterstockLicenseIntent,
  type ShutterstockReferenceOptions,
} from "./shutterstock-reference";

// Every token, account, image and license below is synthetic; no paid calls.
const settings = {
  REFERENCE_SOURCE: "shutterstock",
  SHUTTERSTOCK_ACCESS_TOKEN: "synthetic-token-not-a-real-secret",
  SHUTTERSTOCK_SUBSCRIPTION_ID: "sSynthetic123",
  SHUTTERSTOCK_LICENSE: "platform",
  SHUTTERSTOCK_AI_REFERENCE_APPROVED: "true",
  SHUTTERSTOCK_AGREEMENT_VERSION: "synthetic-agreement-v1",
};
const time = 1_800_000_000_000;
const mediaId = "123456789";
const licenseId = "eSynthetic123";
const downloadUrl = `https://download.shutterstock.com/gatekeeper/synthetic/shutterstock_${mediaId}.jpg?signature=synthetic`;
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]);
const image = {
  id: mediaId,
  media_type: "image",
  image_type: "photo",
  is_illustration: false,
  is_editorial: false,
  is_adult: false,
  has_model_release: true,
  models: [{ id: "synthetic-model" }],
  contributor: { id: "synthetic-contributor", name: "Synthetic author" },
  description: "Adult wearing a cotton shirt in a fashion catalog photograph",
  keywords: ["adult", "shirt", "fashion"],
  url: `https://www.shutterstock.com/image-photo/synthetic-fashion-${mediaId}?tracking=removed`,
  assets: {
    medium_jpg: {
      is_licensable: true,
      format: "jpg",
      width: 1000,
      height: 1500,
      file_size: 250_000,
    },
  },
};
const subscription = {
  id: settings.SHUTTERSTOCK_SUBSCRIPTION_ID,
  license: "platform",
  asset_type: "images",
  expiration_time: new Date(time + 86_400_000).toISOString(),
  allotment: { downloads_left: 10 },
  formats: [{ media_type: "image", format: "jpg", size: "medium" }],
  metadata: {},
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
type RequestRecord = { url: URL; init: RequestInit };
function fixture(
  override?: (
    url: URL,
    init: RequestInit,
  ) => Response | Promise<Response> | undefined,
) {
  const calls: RequestRecord[] = [];
  const events: string[] = [];
  let intent: ShutterstockLicenseIntent | undefined;
  let grant: ShutterstockLicenseGrant | undefined;
  const fetcher: ShutterstockFetch = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    events.push(url.pathname);
    const custom = await override?.(url, init);
    if (custom) return custom;
    switch (url.pathname) {
      case "/v2/user/subscriptions":
        return json({ data: [subscription] });
      case "/v2/images/search":
        return json({ data: [{ id: mediaId }], search_id: "synthetic-search" });
      case `/v2/images/${mediaId}`:
        return json(image);
      case "/v2/images/licenses":
        return json({ data: [{ image_id: mediaId, license_id: licenseId }] });
      case `/v2/images/licenses/${licenseId}/downloads`:
        return json({ url: downloadUrl });
      case `/gatekeeper/synthetic/shutterstock_${mediaId}.jpg`:
        return new Response(jpeg, {
          headers: { "Content-Type": "image/jpeg" },
        });
      default:
        throw new Error("Unexpected synthetic request");
    }
  };
  const options: ShutterstockReferenceOptions = {
    fetch: fetcher,
    customerRef: "opaque-synthetic-customer",
    now: () => time,
    beforeLicense: async (value) => {
      events.push("claim");
      intent = value;
    },
    onLicensed: async (value) => {
      events.push("grant");
      grant = value;
    },
  };
  const licenseCalls = () =>
    calls.filter((call) => call.url.pathname === "/v2/images/licenses");
  return {
    calls,
    events,
    options,
    licenseCalls,
    get intent() {
      return intent;
    },
    get grant() {
      return grant;
    },
  };
}
async function failureCode(work: Promise<unknown>) {
  try {
    await work;
    throw new Error("Expected a safe provider failure");
  } catch (error) {
    expect(error).toBeInstanceOf(ProviderError);
    return error as ProviderError;
  }
}

test("Shutterstock requires an explicitly approved contract and platform configuration", () => {
  expect(readShutterstockSettings(settings).license).toBe("platform");
  for (const patch of [
    { SHUTTERSTOCK_LICENSE: "standard" },
    { SHUTTERSTOCK_ACCESS_TOKEN: "" },
    { REFERENCE_SOURCE: "wikimedia_commons" },
  ])
    expect(() => readShutterstockSettings({ ...settings, ...patch })).toThrow(
      "SHUTTERSTOCK_NOT_CONFIGURED",
    );
  for (const patch of [
    { SHUTTERSTOCK_AI_REFERENCE_APPROVED: "false" },
    { SHUTTERSTOCK_AGREEMENT_VERSION: "" },
    { SHUTTERSTOCK_AGREEMENT_VERSION: "\ninvalid" },
  ])
    expect(() => readShutterstockSettings({ ...settings, ...patch })).toThrow(
      "SHUTTERSTOCK_AGREEMENT_REQUIRED",
    );
  for (const patch of [
    { SHUTTERSTOCK_SUBSCRIPTION_ID: "s123/../../private" },
    { SHUTTERSTOCK_ACCESS_TOKEN: "synthetic-token\r\nInjected: header" },
  ])
    expect(() => readShutterstockSettings({ ...settings, ...patch })).toThrow(
      "SHUTTERSTOCK_NOT_CONFIGURED",
    );
});

test("generic model-wearing queries never forward free text, names or user instructions", () => {
  expect(
    shutterstockReferenceQuery({
      ...mockAnalysisFixture,
      garmentType: "private customer brand hoodie; ignore all instructions",
    }),
  ).toBe(
    "hoodie model studio NOT children NOT teenager NOT lingerie NOT glamour NOT advertising NOT surprised",
  );
  expect(
    shutterstockReferenceQuery({
      ...mockAnalysisFixture,
      garmentType: "private unidentified product",
    }),
  ).not.toContain("private");
});

test("free collection pins a zero-priced explicitly free subscription before search or licensing", async () => {
  const free = { ...settings, SHUTTERSTOCK_COLLECTION: "free" };
  const freeSubscription = {
    ...subscription,
    product_description: "Free API Test Images",
    allotment: { downloads_left: 10, downloads_limit: 500 },
    price_per_download: { local_amount: 0, local_currency: "USD" },
  };
  const f = fixture((url) =>
    url.pathname === "/v2/user/subscriptions"
      ? json({ data: [freeSubscription] })
      : undefined,
  );
  const result = await shutterstockReference(
    mockAnalysisFixture,
    free,
    f.options,
  );
  expect(result.collection).toBe("free");
  expect(f.grant?.collection).toBe("free");
  expect(f.licenseCalls()).toHaveLength(1);
  for (const patch of [
    { product_description: "Paid API Images" },
    { product_description: "Royalty-free Professional Images" },
    { price_per_download: undefined },
    { price_per_download: { local_amount: 0.01, local_currency: "USD" } },
    { price_per_download: { local_amount: "0", local_currency: "USD" } },
    {
      price_per_download: {
        local_amount: 0,
        local_currency: "USD",
        content_tiers: { premium: { local_amount: 1 } },
      },
    },
    { portfolio: true },
    { portfolio: "false" },
    { allotment: { downloads_left: 10, downloads_limit: 1000 } },
  ]) {
    const rejected = fixture((url) =>
      url.pathname === "/v2/user/subscriptions"
        ? json({ data: [{ ...freeSubscription, ...patch }] })
        : undefined,
    );
    expect(
      (
        await failureCode(
          shutterstockReference(mockAnalysisFixture, free, rejected.options),
        )
      ).code,
    ).toBe("SHUTTERSTOCK_FREE_SUBSCRIPTION_REQUIRED");
    expect(rejected.calls).toHaveLength(1);
    expect(rejected.licenseCalls()).toHaveLength(0);
  }
});

test("unsupported collection and cross-collection grants cannot silently upgrade", async () => {
  expect(() =>
    readShutterstockSettings({ ...settings, SHUTTERSTOCK_COLLECTION: "full" }),
  ).toThrow("SHUTTERSTOCK_NOT_CONFIGURED");
  const f = fixture();
  f.options.existingLicense = {
    mediaId,
    licenseId,
    subscriptionId: settings.SHUTTERSTOCK_SUBSCRIPTION_ID,
    license: "platform",
    size: "medium",
    agreementVersion: settings.SHUTTERSTOCK_AGREEMENT_VERSION,
    licensedAt: time - 1000,
    expiresAt: null,
    collection: "free",
  };
  expect(
    (
      await failureCode(
        shutterstockReference(mockAnalysisFixture, settings, f.options),
      )
    ).code,
  ).toBe("SHUTTERSTOCK_POLICY_CHANGED");
  expect(f.licenseCalls()).toHaveLength(0);
});

test("garment metadata outranks stock advertising gestures without an AI scoring call", async () => {
  const advert = {
    ...image,
    id: "999999999",
    description: "Happy model advertising copy space banner surprised gesture",
  };
  expect(shutterstockCandidatePriority(image)).toBeGreaterThan(
    shutterstockCandidatePriority(advert),
  );
  const f = fixture((url) =>
    url.pathname === "/v2/images/search"
      ? json({ data: [advert, image] })
      : undefined,
  );
  const result = await shutterstockReference(
    mockAnalysisFixture,
    settings,
    f.options,
  );
  expect(result.mediaId).toBe(mediaId);
  expect(
    f.calls.some((c) => c.url.pathname === `/v2/images/${advert.id}`),
  ).toBe(false);
  expect(
    f.calls
      .find((c) => c.url.pathname === "/v2/images/search")
      ?.url.searchParams.get("exact_match"),
  ).toBe("true");
});

test("an empty precise query broadens only within the same API library and never retries a license", async () => {
  let searches = 0;
  const f = fixture((url) =>
    url.pathname === "/v2/images/search" && ++searches === 1
      ? json({ data: [] })
      : undefined,
  );
  await shutterstockReference(mockAnalysisFixture, settings, f.options);
  expect(searches).toBe(2);
  expect(f.licenseCalls()).toHaveLength(1);
  expect(
    shutterstockReferenceQueries({
      ...mockAnalysisFixture,
      garmentType: "private-brand sweater",
    }).every((q) => !q.includes("private")),
  ).toBe(true);
});

test("verified commercial photo is licensed once with durable claim/grant before a credential-free download", async () => {
  const f = fixture();
  const result = await shutterstockReference(
    mockAnalysisFixture,
    settings,
    f.options,
  );
  expect(f.licenseCalls()).toHaveLength(1);
  expect(f.events).toEqual([
    "/v2/user/subscriptions",
    "/v2/images/search",
    `/v2/images/${mediaId}`,
    "claim",
    "/v2/images/licenses",
    "grant",
    `/v2/images/licenses/${licenseId}/downloads`,
    `/gatekeeper/synthetic/shutterstock_${mediaId}.jpg`,
  ]);
  const search = f.calls.find((c) => c.url.pathname === "/v2/images/search")
    ?.url.searchParams;
  expect(search?.get("people_model_released")).toBe("true");
  expect(search?.get("people_age")).toBe("20s");
  expect(search?.get("people_number")).toBe("1");
  expect(search?.get("license")).toBe("commercial");
  expect(search?.get("image_type")).toBe("photo");
  expect(JSON.parse(String(f.licenseCalls()[0]?.init.body))).toEqual({
    images: [
      {
        image_id: mediaId,
        subscription_id: settings.SHUTTERSTOCK_SUBSCRIPTION_ID,
        size: "medium",
        format: "jpg",
        price: 0,
        metadata: { customer_id: "opaque-synthetic-customer" },
        search_id: "synthetic-search",
      },
    ],
  });
  expect(f.intent?.agreementVersion).toBe(
    settings.SHUTTERSTOCK_AGREEMENT_VERSION,
  );
  expect(f.grant?.licenseId).toBe(licenseId);
  const download = f.calls.at(-1);
  expect(download?.init.redirect).toBe("manual");
  expect(new Headers(download?.init.headers).has("Authorization")).toBe(false);
  expect(result.bytes).toEqual(jpeg);
  expect(result.sourcePage).toBe(
    `https://www.shutterstock.com/image-photo/synthetic-fashion-${mediaId}`,
  );
  expect(result.actualCostUsd).toBeNull();
  expect(result.modelRelease).toBe(true);
  expect(result.downloadExpiresAt).toBe(time + 8 * 60 * 60 * 1000);
  expect(f.grant?.expiresAt).toBeNull();
});

test("inactive, wrong-license, malformed-balance or unsupported subscription never searches or licenses", async () => {
  for (const patch of [
    { license: "standard" },
    { expiration_time: "invalid date" },
    { expiration_time: new Date(time - 1).toISOString() },
    { allotment: { downloads_left: "10" } },
    { allotment: { downloads_left: 0 } },
    { allotment: { downloads_left: Number.MAX_SAFE_INTEGER + 1 } },
    { formats: [{ media_type: "image", format: "jpg", size: "huge" }] },
    { metadata: { project: { is_required: true } } },
  ]) {
    const f = fixture((url) =>
      url.pathname === "/v2/user/subscriptions"
        ? json({ data: [{ ...subscription, ...patch }] })
        : undefined,
    );
    await failureCode(
      shutterstockReference(mockAnalysisFixture, settings, f.options),
    );
    expect(f.calls).toHaveLength(1);
    expect(f.licenseCalls()).toHaveLength(0);
  }
});

test("the official full-view shape may omit optional negative flags and size metadata", async () => {
  // The official Image example guarantees photo/media type/model release but
  // contains preview assets only, not the optional medium_jpg properties.
  const f = fixture((url) =>
    url.pathname === `/v2/images/${mediaId}`
      ? json({
          id: mediaId,
          media_type: "image",
          image_type: "photo",
          has_model_release: true,
          contributor: { id: "synthetic-contributor" },
          description: "Adult fashion catalog photograph",
          assets: {
            preview: {
              width: 300,
              height: 450,
              url: "https://image.shutterstock.com/synthetic.jpg",
            },
          },
        })
      : undefined,
  );
  const result = await shutterstockReference(
    mockAnalysisFixture,
    settings,
    f.options,
  );
  expect(result.mediaId).toBe(mediaId);
  expect(f.licenseCalls()).toHaveLength(1);
  expect(f.calls.every((c) => c.init.signal instanceof AbortSignal)).toBe(true);
});

test("missing release, editorial, sexual content, minors, AI or unsafe medium metadata fail before a paid license", async () => {
  for (const patch of [
    { has_model_release: false },
    { has_model_release: undefined },
    { is_editorial: true },
    { is_adult: true },
    { is_editorial: "false" },
    { is_adult: null },
    { is_illustration: 0 },
    { is_illustration: true },
    { image_type: "illustration" },
    { keywords: ["teenager"] },
    { description: "AI-generated adult model" },
    { ai_ip_review: { status: "approved" } },
    { models: [{ id: "one" }, { id: "two" }] },
    { assets: { medium_jpg: { ...image.assets.medium_jpg, width: "1000" } } },
    {
      assets: {
        medium_jpg: { ...image.assets.medium_jpg, file_size: 7 * 1024 * 1024 },
      },
    },
    {
      assets: {
        medium_jpg: { ...image.assets.medium_jpg, width: 3000, height: 3000 },
      },
    },
  ]) {
    const f = fixture((url) =>
      url.pathname === `/v2/images/${mediaId}`
        ? json({ ...image, ...patch })
        : undefined,
    );
    const error = await failureCode(
      shutterstockReference(mockAnalysisFixture, settings, f.options),
    );
    expect(error.code).toBe("SHUTTERSTOCK_NO_ELIGIBLE_IMAGE");
    expect(f.licenseCalls()).toHaveLength(0);
    expect(f.events).not.toContain("claim");
  }
});

test("a failed durable claim prevents the paid request", async () => {
  const f = fixture();
  f.options.beforeLicense = async () => {
    throw new ProviderError("SYNTHETIC_LEDGER_UNAVAILABLE");
  };
  expect(
    (
      await failureCode(
        shutterstockReference(mockAnalysisFixture, settings, f.options),
      )
    ).code,
  ).toBe("SYNTHETIC_LEDGER_UNAVAILABLE");
  expect(f.licenseCalls()).toHaveLength(0);
});

test("ambiguous license responses are never retried or downloaded", async () => {
  for (const response of [
    () => {
      throw new Error("Synthetic transport timeout");
    },
    () => json({}, 502),
    () => json({}, 408),
    () => new Response("not-json"),
    () => json({ data: [{ image_id: mediaId }] }),
    () => json({ data: [{ image_id: "987654321", license_id: licenseId }] }),
  ]) {
    const f = fixture((url) =>
      url.pathname === "/v2/images/licenses" ? response() : undefined,
    );
    const error = await failureCode(
      shutterstockReference(mockAnalysisFixture, settings, f.options),
    );
    expect(error.code).toBe("SHUTTERSTOCK_LICENSE_UNCERTAIN");
    expect(error.unknownOutcome).toBe(true);
    expect(f.licenseCalls()).toHaveLength(1);
    expect(f.events).not.toContain("grant");
    expect(f.calls.some((c) => c.url.pathname.endsWith("/downloads"))).toBe(
      false,
    );
  }
});

test("definitive license rejection is classified without a retry", async () => {
  const f = fixture((url) =>
    url.pathname === "/v2/images/licenses"
      ? json({ message: "Synthetic rejected request" }, 403)
      : undefined,
  );
  const error = await failureCode(
    shutterstockReference(mockAnalysisFixture, settings, f.options),
  );
  expect(error.code).toBe("SHUTTERSTOCK_LICENSE_REJECTED");
  expect(error.unknownOutcome).toBe(false);
  expect(f.licenseCalls()).toHaveLength(1);
});

test("grant storage failure stops before download and preserves an uncertain paid outcome", async () => {
  const f = fixture();
  f.options.onLicensed = async () => {
    throw new Error("Synthetic lost durable response");
  };
  const error = await failureCode(
    shutterstockReference(mockAnalysisFixture, settings, f.options),
  );
  expect(error.code).toBe("SHUTTERSTOCK_LICENSE_UNCERTAIN");
  expect(error.unknownOutcome).toBe(true);
  expect(f.licenseCalls()).toHaveLength(1);
  expect(f.calls.some((c) => c.url.pathname.endsWith("/downloads"))).toBe(
    false,
  );
});

test("a previously persisted matching grant resumes with no new license purchase", async () => {
  const f = fixture();
  f.options.existingLicense = {
    mediaId,
    licenseId,
    subscriptionId: settings.SHUTTERSTOCK_SUBSCRIPTION_ID,
    license: "platform",
    size: "medium",
    agreementVersion: settings.SHUTTERSTOCK_AGREEMENT_VERSION,
    licensedAt: time - 1000,
    expiresAt: null,
  };
  await shutterstockReference(mockAnalysisFixture, settings, f.options);
  expect(f.licenseCalls()).toHaveLength(0);
  expect(f.events).not.toContain("claim");
  expect(f.events).not.toContain("grant");
  expect(f.calls.some((c) => c.url.pathname === "/v2/images/search")).toBe(
    false,
  );
});

test("only the exact HTTPS download host and matching licensed image can be fetched", async () => {
  for (const url of [
    "https://127.0.0.1/private",
    "http://download.shutterstock.com/gatekeeper/x/shutterstock_123456789.jpg",
    "https://download.shutterstock.com.evil.invalid/gatekeeper/x/shutterstock_123456789.jpg",
    "https://secret@download.shutterstock.com/gatekeeper/x/shutterstock_123456789.jpg",
    "https://download.shutterstock.com/gatekeeper/x/shutterstock_987654321.jpg",
    "https://download.shutterstock.com:8443/gatekeeper/x/shutterstock_123456789.jpg",
  ]) {
    const f = fixture((request) =>
      request.pathname.endsWith("/downloads") ? json({ url }) : undefined,
    );
    expect(
      (
        await failureCode(
          shutterstockReference(mockAnalysisFixture, settings, f.options),
        )
      ).code,
    ).toBe("SHUTTERSTOCK_DOWNLOAD_URL_REJECTED");
    expect(
      f.calls.every((c) => c.url.hostname === "api.shutterstock.com"),
    ).toBe(true);
    expect(f.licenseCalls()).toHaveLength(1);
  }
});

test("download redirects, non-JPEG bytes and oversized streams are rejected without repurchasing", async () => {
  let cancelled = false;
  for (const response of [
    () =>
      new Response(null, {
        status: 302,
        headers: { Location: "https://evil.invalid" },
      }),
    () =>
      new Response("synthetic non-image", {
        headers: { "Content-Type": "image/jpeg" },
      }),
    () => new Response(jpeg, { headers: { "Content-Type": "image/png" } }),
    () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(6 * 1024 * 1024 + 1));
          },
          cancel() {
            cancelled = true;
          },
        }),
        { headers: { "Content-Type": "image/jpeg" } },
      ),
  ]) {
    const f = fixture((url) =>
      url.hostname === "download.shutterstock.com" ? response() : undefined,
    );
    await failureCode(
      shutterstockReference(mockAnalysisFixture, settings, f.options),
    );
    expect(f.licenseCalls()).toHaveLength(1);
    expect(f.calls.at(-1)?.init.redirect).toBe("manual");
  }
  expect(cancelled).toBe(true);
});
