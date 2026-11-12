import { expect, test } from "bun:test";
import {
  parseShutterstockProbeToken,
  parseShutterstockProbeVariable,
  probeShutterstockSearch,
  type ProbeFetch,
} from "./shutterstock-search-probe";

const token = "synthetic-search-token-not-a-real-secret";
const key = "synthetic-consumer-key";
const secret = "synthetic-consumer-secret";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
function fixture(
  options: {
    emptyPrimary?: boolean;
    releaseUnknown?: boolean;
    unsafePreview?: boolean;
    keywords?: string[];
  } = {},
) {
  const calls: { url: URL; init: RequestInit }[] = [];
  const fetcher: ProbeFetch = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    if (url.pathname === "/v2/user/subscriptions")
      return json({
        data: [
          {
            id: "synthetic-private-subscription",
            license: "standard",
            metadata: { customer_id: "synthetic-private-customer" },
          },
        ],
      });
    if (url.pathname === "/v2/images/search") {
      const query = url.searchParams.get("query") ?? "";
      if (options.emptyPrimary && query.startsWith("adult model"))
        return json({ data: [], total_count: 0 });
      return json({
        total_count: 123,
        data: [{ id: "123456789" }, { id: "234567891" }],
      });
    }
    const id = url.pathname.split("/").at(-1);
    if (/^[0-9]+$/.test(id ?? ""))
      return json({
        id,
        media_type: "image",
        image_type: "photo",
        ...(options.releaseUnknown ? {} : { has_model_release: true }),
        description: `Synthetic adult wearing casual clothing ${token} ${key} ${secret}`,
        ...(options.keywords ? { keywords: options.keywords } : {}),
        assets: {
          preview: {
            url: options.unsafePreview
              ? `https://image.shutterstock.com.evil.invalid/display_pic_with_logo/x/stock-photo-${id}.jpg`
              : `https://image.shutterstock.com/display_pic_with_logo/x/stock-photo-${id}.jpg`,
          },
        },
      });
    throw new Error("Unexpected synthetic request");
  };
  return { calls, fetcher };
}

test("fixed-variable parser supports CRLF and quotes without evaluating dotenv or code", () => {
  expect(
    parseShutterstockProbeToken(
      `OTHER_SECRET=ignored\r\nSHUTTERSTOCK_ACCESS_TOKEN="${token}" # synthetic\r\n`,
    ),
  ).toBe(token);
  expect(
    parseShutterstockProbeToken(
      `export SHUTTERSTOCK_ACCESS_TOKEN='${token}'\n`,
    ),
  ).toBe(token);
  expect(
    parseShutterstockProbeToken(
      `SHUTTERSTOCK_ACCESS_TOKEN=${token}\nSHUTTERSTOCK_ACCESS_TOKEN=${token}`,
    ),
  ).toBeNull();
  expect(
    parseShutterstockProbeToken(
      'SHUTTERSTOCK_ACCESS_TOKEN="synthetic\\nnewline-token"',
    ),
  ).toBeNull();
  expect(
    parseShutterstockProbeVariable(
      `SHUTTERSTOCK_CONSUMER_KEY='${key}'`,
      "SHUTTERSTOCK_CONSUMER_KEY",
    ),
  ).toBe(key);
  expect(
    parseShutterstockProbeVariable(
      "SHUTTERSTOCK_CONSUMER_SECRET='literal-$(no-evaluation)'",
      "SHUTTERSTOCK_CONSUMER_SECRET",
    ),
  ).toBe("literal-$(no-evaluation)");
});

test("bearer probe is fixed-host GET-only, at most 10 requests, sanitized metadata and watermarked URL only", async () => {
  const f = fixture();
  const report = await probeShutterstockSearch(token, {
    fetch: f.fetcher,
    now: () => 1_800_000_000_000,
  });
  expect(report.status).toBe("completed");
  expect(report.requestCount).toBe(10);
  expect(report.searches).toHaveLength(3);
  expect(report.subscriptions).toEqual({
    status: "available",
    count: 1,
    licenseCounts: { standard: 1 },
  });
  for (const call of f.calls) {
    expect(call.url.origin).toBe("https://api.shutterstock.com");
    expect(call.init.method).toBe("GET");
    expect(call.init.body).toBeUndefined();
    expect(call.init.redirect).toBe("manual");
    expect(new Headers(call.init.headers).get("Authorization")).toBe(
      `Bearer ${token}`,
    );
    expect(call.init.signal).toBeInstanceOf(AbortSignal);
    expect(call.url.pathname).not.toContain("licenses");
  }
  for (const search of report.searches) {
    expect(search.mode).toBe("production");
    expect(search.checkedDetails).toBe(2);
    expect(search.eligibleCount).toBe(2);
    expect(search.samples).toHaveLength(1);
    expect(search.samples[0]?.previewUrl).toStartWith(
      "https://image.shutterstock.com/display_pic_with_logo/",
    );
    expect(search.samples[0]?.description.length).toBeLessThanOrEqual(100);
  }
  const serialized = JSON.stringify(report);
  expect(serialized).not.toContain(token);
  expect(serialized).not.toContain("synthetic-private-subscription");
  expect(serialized).not.toContain("synthetic-private-customer");
  expect(report.licensed).toBe(false);
  expect(report.aiProcessingVerified).toBe(false);
});

test("Basic search mode skips OAuth-only subscription endpoint and never infers entitlements", async () => {
  const f = fixture();
  const report = await probeShutterstockSearch(
    { consumerKey: key, consumerSecret: secret },
    { fetch: f.fetcher },
  );
  expect(report.authentication).toBe("basic");
  expect(report.requestCount).toBe(9);
  expect(report.subscriptions).toEqual({
    status: "not_checked_requires_oauth",
    count: null,
    licenseCounts: {},
  });
  expect(
    f.calls.every((call) => call.url.pathname.startsWith("/v2/images/")),
  ).toBe(true);
  for (const call of f.calls)
    expect(new Headers(call.init.headers).get("Authorization")).toBe(
      `Basic ${btoa(`${key}:${secret}`)}`,
    );
  expect(JSON.stringify(report)).not.toContain(key);
  expect(JSON.stringify(report)).not.toContain(secret);
  expect(JSON.stringify(report)).not.toContain(btoa(`${key}:${secret}`));
});

test("empty production queries trigger separate broader diagnostics with unchanged rights and adult filters", async () => {
  const f = fixture({ emptyPrimary: true });
  const report = await probeShutterstockSearch(token, { fetch: f.fetcher });
  expect(report.requestCount).toBe(10);
  expect(report.searches).toHaveLength(6);
  expect(
    report.searches
      .slice(0, 3)
      .every((q) => q.mode === "production" && q.totalCount === 0),
  ).toBe(true);
  expect(
    report.searches
      .slice(3)
      .every((q) => q.mode === "broader_diagnostic" && q.checkedDetails === 1),
  ).toBe(true);
  for (const call of f.calls.filter((item) =>
    item.url.pathname.endsWith("/search"),
  )) {
    expect(call.url.searchParams.get("people_age")).toBe("20s");
    expect(call.url.searchParams.get("people_number")).toBe("1");
    expect(call.url.searchParams.get("people_model_released")).toBe("true");
    expect(call.url.searchParams.get("license")).toBe("commercial");
    expect(call.url.searchParams.get("image_type")).toBe("photo");
    expect(call.url.searchParams.get("safe")).toBe("true");
  }
});

test("missing release metadata is unknown rather than a rights assertion, unsafe previews are excluded", async () => {
  const f = fixture({ releaseUnknown: true, unsafePreview: true });
  const report = await probeShutterstockSearch(token, { fetch: f.fetcher });
  for (const search of report.searches) {
    expect(search.eligibleCount).toBe(0);
    expect(search.releaseUnknownCount).toBe(2);
    expect(search.samples[0]?.modelRelease).toBe("unknown");
    expect(search.samples[0]?.previewUrl).toBeNull();
  }
});

test("rejection diagnostics separate ambiguous age tags from explicit minors without storing keywords", async () => {
  const ambiguous = fixture({ keywords: ["adult", "girl", "fashion"] });
  const first = await probeShutterstockSearch(token, {
    fetch: ambiguous.fetcher,
  });
  for (const search of first.searches) {
    expect(search.rejectedCount).toBe(2);
    expect(search.rejectionReasons).toEqual({ AMBIGUOUS_AGE_TERMS: 2 });
    expect(search.samples).toEqual([]);
  }
  const explicit = fixture({ keywords: ["teenager", "girl"] });
  const second = await probeShutterstockSearch(token, {
    fetch: explicit.fetcher,
  });
  for (const search of second.searches)
    expect(search.rejectionReasons).toEqual({
      EXPLICIT_MINOR_TERMS: 2,
      AMBIGUOUS_AGE_TERMS: 2,
    });
  expect(JSON.stringify(second)).not.toContain('"keywords"');
  expect(JSON.stringify(second)).not.toContain("teenager,girl");
});

test("rate limiting stops immediately without retries, auth or parser errors never echo provider content", async () => {
  for (const status of [429, 401]) {
    const calls: string[] = [];
    const report = await probeShutterstockSearch(token, {
      fetch: async (input) => {
        calls.push(String(input));
        return json({ message: `Never print ${token}` }, status);
      },
    });
    expect(report.status).toBe(status === 429 ? "rate_limited" : "auth_failed");
    expect(calls).toHaveLength(status === 429 ? 1 : 2);
    expect(JSON.stringify(report)).not.toContain(token);
  }
  const report = await probeShutterstockSearch(token, {
    fetch: async () => new Response(`invalid ${token}`),
  });
  expect(report.status).toBe("source_unavailable");
  expect(report.requestCount).toBe(2);
  expect(JSON.stringify(report)).not.toContain(token);
});

test("redirects are rejected, never followed and never used as credential destinations", async () => {
  const calls: string[] = [];
  const report = await probeShutterstockSearch(
    { consumerKey: key, consumerSecret: secret },
    {
      fetch: async (input, init) => {
        calls.push(String(input));
        expect(init?.redirect).toBe("manual");
        return new Response(null, {
          status: 302,
          headers: { Location: `https://evil.invalid/${token}` },
        });
      },
    },
  );
  expect(calls).toHaveLength(1);
  expect(report.status).toBe("source_unavailable");
  expect(JSON.stringify(report)).not.toContain("evil.invalid");
});

test("failure receipts retain HTTP status and only a documented error-code allowlist", async () => {
  const report = await probeShutterstockSearch(
    { consumerKey: key, consumerSecret: secret },
    {
      fetch: async () =>
        json(
          {
            errors: [
              { code: "VALIDATION_INVALID_TYPE", message: token, data: secret },
            ],
            customer_id: "private",
          },
          400,
        ),
    },
  );
  expect(report.status).toBe("source_unavailable");
  expect(report.diagnostics).toEqual([
    {
      operation: "search",
      httpStatus: 400,
      providerCode: "VALIDATION_INVALID_TYPE",
    },
  ]);
  expect(JSON.stringify(report)).not.toContain(token);
  expect(JSON.stringify(report)).not.toContain(secret);
  expect(JSON.stringify(report)).not.toContain("customer_id");
  const unknown = await probeShutterstockSearch(
    { consumerKey: key, consumerSecret: secret },
    {
      fetch: async () => json({ code: token }, 403),
    },
  );
  expect(unknown.diagnostics).toEqual([
    { operation: "search", httpStatus: 403, providerCode: null },
  ]);
  expect(JSON.stringify(unknown)).not.toContain(token);
});

test("--help is safe without reading credentials, writing reports or requesting network", async () => {
  const command = Bun.spawn(
    [process.execPath, "scripts/shutterstock-search-probe.ts", "--help"],
    {
      cwd: import.meta.dir.replace(/[\\/]scripts$/, ""),
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, SHUTTERSTOCK_ACCESS_TOKEN: token },
    },
  );
  const [out, err, status] = await Promise.all([
    new Response(command.stdout).text(),
    new Response(command.stderr).text(),
    command.exited,
  ]);
  expect(status).toBe(0);
  expect(out).toContain("GET-only");
  expect(out).toContain("SHUTTERSTOCK_CONSUMER_KEY");
  expect(`${out}${err}`).not.toContain(token);
});
