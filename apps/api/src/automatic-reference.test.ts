import { expect, test } from "bun:test";
import {
  searchCommonsReference,
  ensureAutomaticReference,
  getAutomaticReferences,
  referenceQueries,
  type ReferenceFetch,
} from "./automatic-reference";
import { studioFixture } from "../test/studio";
import { mockAnalysisFixture } from "../../../packages/ai/src/fixtures";
import { normalizeImage } from "./images";

const analysis = mockAnalysisFixture;
function candidate(patch: Record<string, unknown> = {}) {
  return {
    title: "File:Synthetic concrete stairs.jpg",
    index: 1,
    imageinfo: [
      {
        mime: "image/jpeg",
        thumbwidth: 767,
        thumbheight: 1024,
        thumburl:
          "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Synthetic.jpg/1024px-Synthetic.jpg",
        descriptionurl:
          "https://commons.wikimedia.org/wiki/File:Synthetic_concrete_stairs.jpg",
        metadata: [
          { name: "Make", value: "Synthetic camera" },
          { name: "Model", value: "Synthetic camera model" },
        ],
        extmetadata: {
          LicenseShortName: { value: "CC0" },
          LicenseUrl: {
            value: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
          },
          Artist: {
            value: '<a href="https://example.invalid">Synthetic author</a>',
          },
          Categories: { value: "CC-Zero|Concrete stairs" },
          ImageDescription: { value: "Plain unoccupied concrete steps" },
        },
        ...patch,
      },
    ],
  };
}
function sourceFetch(pages: unknown[], urls: string[]) {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    urls.push(String(url));
    expect(init?.redirect).toBe("manual");
    expect(new Headers(init?.headers).get("User-Agent")).toContain(
      "PhotoStudioReferenceBot",
    );
    return String(url).startsWith("https://commons.wikimedia.org/w/api.php")
      ? Response.json({
          query: {
            pages: Object.fromEntries(pages.map((page, i) => [i, page])),
          },
        })
      : new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), {
          headers: { "content-type": "image/jpeg" },
        });
  }) as ReferenceFetch;
}
test("automatic discovery verifies primary CC0/camera metadata and only downloads bounded allowlisted thumbnails", async () => {
  const urls: string[] = [];
  const found = await searchCommonsReference(
    ["concrete stairs"],
    sourceFetch([candidate()], urls),
  );
  expect(urls).toHaveLength(2);
  expect(found.creator).toBe("Synthetic author");
  expect(found.license).toBe("cc0");
  expect(found.bytes[0]).toBe(255);
  expect(urls[0]).toContain("iiurlheight=768");
  expect(urls[0]).toContain("incategory%3ACC-Zero");
  expect(
    referenceQueries({
      ...analysis,
      seasonGuess: ["winter"],
      garmentType: "Synthetic private prompt https://internal.invalid/secret",
    }),
  ).toEqual(["concrete stairs", "stone wall courtyard"]);
  expect(referenceQueries({ ...analysis, garmentType: "니트 스웨터" })).toEqual(
    ["window interior", "concrete stairs"],
  );
});
test("rejects private URLs, redirects, non-CC0, missing camera metadata and portrait categories without following them", async () => {
  const urls: string[] = [];
  const bad = [
    candidate({ thumburl: "https://127.0.0.1/private" }),
    candidate({ metadata: [] }),
    candidate({ thumbwidth: undefined }),
    candidate({ thumbheight: 3000, thumbwidth: 500 }),
    candidate({ mime: "image/svg+xml" }),
    candidate({
      extmetadata: {
        LicenseShortName: { value: "CC BY" },
        LicenseUrl: { value: "https://creativecommons.org/licenses/by/4.0/" },
      },
    }),
    candidate({
      extmetadata: {
        ...candidate().imageinfo[0]?.extmetadata,
        Categories: { value: "Portraits of people" },
      },
    }),
  ];
  await expect(
    searchCommonsReference(["concrete stairs"], sourceFetch(bad, urls)),
  ).rejects.toMatchObject({ code: "AUTO_REFERENCE_NO_ELIGIBLE_IMAGE" });
  expect(urls).toHaveLength(1);
  const rate = (async () =>
    new Response(null, {
      status: 429,
      headers: { "retry-after": "60" },
    })) as ReferenceFetch;
  await expect(
    searchCommonsReference(["concrete stairs"], rate),
  ).rejects.toMatchObject({ code: "AUTO_REFERENCE_RATE_LIMITED" });
  let count = 0;
  const redirect = (async () =>
    ++count === 1
      ? Response.json({ query: { pages: { one: candidate() } } })
      : new Response(null, {
          status: 302,
          headers: { location: "http://127.0.0.1/private" },
        })) as ReferenceFetch;
  await expect(
    searchCommonsReference(["concrete stairs"], redirect),
  ).rejects.toMatchObject({ code: "AUTO_REFERENCE_NO_ELIGIBLE_IMAGE" });
  expect(count).toBe(2);
});
test("retrieval is claimed once, reused durably and stays owner-scoped without an AI attempt", async () => {
  const s = await studioFixture(),
    job = await s.startPlan();
  const row = s.sqlite
    .query("SELECT * FROM generation_jobs WHERE id=?")
    .get(job.id) as Record<string, unknown>;
  const jobRow = {
    ...row,
    id: job.id,
    userId: row.user_id,
    productId: row.product_id,
    requestJson: row.request_json,
  } as Parameters<typeof ensureAutomaticReference>[1];
  let release!: () => void,
    calls = 0;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const normalize = async (...args: Parameters<typeof normalizeImage>) => {
    calls++;
    await gate;
    return normalizeImage(...args);
  };
  const first = ensureAutomaticReference(s.env, jobRow, analysis, {
    normalize,
  });
  // Wait for the claim to reach the deliberately paused decoder.
  while (calls === 0) await new Promise((resolve) => setTimeout(resolve, 1));
  await expect(
    ensureAutomaticReference(s.env, jobRow, analysis),
  ).rejects.toMatchObject({ code: "AUTO_REFERENCE_IN_PROGRESS" });
  release();
  const selected = await first;
  expect(selected.status).toBe("selected");
  expect(selected.provider).toBe("mock");
  expect(selected.license).toBe("synthetic");
  expect(await ensureAutomaticReference(s.env, jobRow, analysis)).toEqual(
    selected,
  );
  expect(calls).toBe(1);
  expect(s.objects.size).toBe(2);
  expect((await s.call(`/assets/${selected.assetId}`, "DELETE")).status).toBe(
    409,
  );
  expect(s.objects.size).toBe(2);
  expect(
    await getAutomaticReferences(s.env, "unrelated-user", s.product.id),
  ).toEqual([]);
  expect(
    s.sqlite.query("SELECT count(*) n FROM generation_attempts").get(),
  ).toEqual({ n: 0 });
});
