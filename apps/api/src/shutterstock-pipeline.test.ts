import { expect, test } from "bun:test";
import { mockAdapter } from "@photo-studio/ai";
import { createDb, eq, jobs } from "@photo-studio/db";
import type { JobDto, PipelineDto } from "@photo-studio/schemas";
import { mockAnalysisFixture } from "../../../packages/ai/src/fixtures";
import { studioFixture } from "../test/studio";
import { syntheticPng } from "../test/png";
import {
  assertStockReferenceUsage,
  ensureAutomaticReference,
  getAutomaticReferences,
  type ReferenceFetch,
} from "./automatic-reference";
import { runPlanStage } from "./pipeline";
import type { GenerationSnapshot } from "./generation";
import { runGenerationStage } from "./generation";
import type { normalizeImage } from "./images";

type Studio = Awaited<ReturnType<typeof studioFixture>>;
const mediaId = "1234567";
const licenseId = "synthetic_license_1";
const agreement = "synthetic-fashion-contract-v1";
const pixels = syntheticPng(320, 480);
const expectedImage = `data:image/png;base64,${Buffer.from(pixels).toString("base64")}`;

function owner(s: Studio) {
  return (
    s.sqlite
      .query("SELECT user_id FROM products WHERE id=?")
      .get(s.product.id) as {
      user_id: string;
    }
  ).user_id;
}
function configure(s: Studio) {
  // Exercise the live-source branch using fake transport and fake AI only.
  s.sqlite.query("UPDATE users SET is_test=0 WHERE id=?").run(owner(s));
  Object.assign(s.env, {
    REFERENCE_SOURCE: "shutterstock",
    SHUTTERSTOCK_ACCESS_TOKEN: "synthetic_stock_token_for_tests_only",
    SHUTTERSTOCK_SUBSCRIPTION_ID: "synthetic_subscription",
    SHUTTERSTOCK_LICENSE: "platform",
    SHUTTERSTOCK_AI_REFERENCE_APPROVED: "true",
    SHUTTERSTOCK_AGREEMENT_VERSION: agreement,
    OPENROUTER_ANALYSIS_MODEL: "mock/analyzer-planner-v1",
  });
}
async function jobRow(s: Studio, id: string) {
  const job = await createDb(s.env.DB)
    .select()
    .from(jobs)
    .where(eq(jobs.id, id))
    .get();
  if (!job) throw new Error("Synthetic job missing");
  return job;
}
function snapshot<T = GenerationSnapshot>(s: Studio, id: string): T {
  const row = s.sqlite
    .query("SELECT request_json FROM generation_jobs WHERE id=?")
    .get(id) as { request_json: string };
  return JSON.parse(row.request_json) as T;
}
function ledger(s: Studio, id: string) {
  return s.sqlite
    .query("SELECT metadata_json FROM reference_retrievals WHERE id=?")
    .get(id) as {
    metadata_json: string;
  };
}
function fakeStock(s: Studio, id: string) {
  let licensePosts = 0;
  const requests: string[] = [];
  const fetcher: ReferenceFetch = async (input, init) => {
    const url = new URL(String(input));
    requests.push(`${init?.method ?? "GET"} ${url.pathname}`);
    expect(init?.redirect).toBe("manual");
    if (url.hostname === "download.shutterstock.com") {
      expect(new Headers(init?.headers).has("Authorization")).toBe(false);
      expect(JSON.parse(ledger(s, id).metadata_json).licensing.status).toBe(
        "licensed",
      );
      return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), {
        headers: { "Content-Type": "image/jpeg" },
      });
    }
    expect(url.origin).toBe("https://api.shutterstock.com");
    if (url.pathname === "/v2/user/subscriptions")
      return Response.json({
        data: [
          {
            id: "synthetic_subscription",
            license: "platform",
            asset_type: "images",
            expiration_time: new Date(Date.now() + 86_400_000).toISOString(),
            allotment: { downloads_left: 10 },
            formats: [{ media_type: "image", format: "jpg", size: "medium" }],
          },
        ],
      });
    if (url.pathname === "/v2/images/search") {
      expect(url.searchParams.get("people_model_released")).toBe("true");
      expect(url.searchParams.get("people_age")).toBe("20s");
      expect(url.searchParams.get("license")).toBe("commercial");
      return Response.json({
        search_id: "synthetic_search",
        data: [{ id: mediaId }],
      });
    }
    if (url.pathname === `/v2/images/${mediaId}`)
      return Response.json({
        id: mediaId,
        media_type: "image",
        image_type: "photo",
        is_illustration: false,
        is_editorial: false,
        is_adult: false,
        has_model_release: true,
        models: [{ id: "synthetic_adult" }],
        description: "Adult model wearing a casual shirt in directional light",
        contributor: { name: "Synthetic photographer" },
        assets: {
          medium_jpg: {
            is_licensable: true,
            format: "jpg",
            file_size: 4,
            width: 320,
            height: 480,
          },
        },
      });
    if (url.pathname === "/v2/images/licenses") {
      licensePosts++;
      const recorded = JSON.parse(ledger(s, id).metadata_json).licensing;
      expect(recorded.status).toBe("claimed");
      expect(recorded.intent.mediaId).toBe(mediaId);
      expect(recorded.intent.customerRef).not.toBe(owner(s));
      expect(recorded.actualCostUsd).toBeNull();
      const sent = JSON.parse(String(init?.body));
      expect(sent.images[0].metadata.customer_id).toBe(
        recorded.intent.customerRef,
      );
      return Response.json({
        data: [{ image_id: mediaId, license_id: licenseId }],
      });
    }
    if (url.pathname === `/v2/images/licenses/${licenseId}/downloads`) {
      const saved = JSON.parse(ledger(s, id).metadata_json).licensing;
      expect(saved.status).toBe("licensed");
      expect(saved.grant.licenseId).toBe(licenseId);
      return Response.json({
        url: `https://download.shutterstock.com/gatekeeper/synthetic/shutterstock_${mediaId}.jpg`,
      });
    }
    throw new Error("Unexpected synthetic stock transport request");
  };
  const normalize: typeof normalizeImage = async () => ({
    bytes: pixels,
    mimeType: "image/png",
    width: 320,
    height: 480,
  });
  return {
    fetcher,
    normalize,
    requests,
    get licensePosts() {
      return licensePosts;
    },
  };
}
async function startStock(s: Studio) {
  const queued = await s.call<JobDto>(
    `/products/${s.product.id}/plan`,
    "POST",
    {
      ...s.planInput,
      useAutomaticReference: true,
    },
  );
  expect(queued.status).toBe(202);
  expect(
    snapshot<{ automaticReferenceProvider: string }>(s, queued.data.id)
      .automaticReferenceProvider,
  ).toBe("shutterstock");
  return queued.data;
}

test("a licensed photo decode failure retains its grant and never licenses again or recommends an unbilled retry", async () => {
  const s = await studioFixture();
  configure(s);
  const queued = await startStock(s);
  const row = await jobRow(s, queued.id);
  const source = fakeStock(s, queued.id);
  await expect(
    ensureAutomaticReference(s.env, row, mockAnalysisFixture, {
      fetch: source.fetcher,
      normalize: async () => {
        throw new Error("Synthetic decoding failure");
      },
    }),
  ).rejects.toMatchObject({
    code: "SHUTTERSTOCK_LICENSED_REFERENCE_UNAVAILABLE",
  });
  expect(
    JSON.parse(ledger(s, queued.id).metadata_json).licensing,
  ).toMatchObject({
    status: "licensed",
    grant: { licenseId },
    actualCostUsd: null,
  });
  await expect(
    ensureAutomaticReference(s.env, row, mockAnalysisFixture, {
      fetch: source.fetcher,
    }),
  ).rejects.toMatchObject({
    code: "SHUTTERSTOCK_LICENSED_REFERENCE_UNAVAILABLE",
  });
  expect(source.licensePosts).toBe(1);
  expect(
    s.sqlite.query("SELECT count(*) n FROM generation_attempts").get(),
  ).toEqual({ n: 0 });
});
async function readyStock() {
  const s = await studioFixture();
  configure(s);
  const queued = await startStock(s);
  const source = fakeStock(s, queued.id);
  const adapter = mockAdapter(),
    plan = adapter.plan;
  let planningCalls = 0;
  adapter.plan = async (...args) => {
    planningCalls++;
    expect(args[4]?.lookImage).toBe(expectedImage);
    expect(args[4]?.lookReferenceKind).toBe("automatic_fashion");
    return plan(...args);
  };
  const deps = { adapter: async () => adapter };
  await runPlanStage(s.env, queued.id, "analysis", deps);
  await runPlanStage(s.env, queued.id, "planning", {
    ...deps,
    automaticReference: (env, job, analysis) =>
      ensureAutomaticReference(env, job, analysis, {
        fetch: source.fetcher,
        normalize: source.normalize,
      }),
  });
  const pipeline = (
    await s.call<PipelineDto>(`/products/${s.product.id}/pipeline`)
  ).data;
  const planned = pipeline.plans[0],
    reference = pipeline.retrievals?.[0];
  if (!planned || !reference?.assetId)
    throw new Error("Synthetic stock plan missing");
  expect(planningCalls).toBe(1);
  expect(reference.provider).toBe("shutterstock");
  expect(planned.lookReferenceId).toBe(reference.assetId);
  return { ...s, planned, reference, queued, source };
}

test("a lost stock license response becomes outcome_unknown and a Workflow replay cannot bill again", async () => {
  const s = await studioFixture();
  configure(s);
  const queued = await startStock(s);
  const source = fakeStock(s, queued.id);
  const adapter = mockAdapter();
  const deps = { adapter: async () => adapter };
  await runPlanStage(s.env, queued.id, "analysis", deps);
  const retrieval: typeof ensureAutomaticReference = (env, job, analysis) =>
    ensureAutomaticReference(env, job, analysis, {
      normalize: source.normalize,
      fetch: async (url, init) => {
        const response = await source.fetcher(url, init);
        if (String(url) === "https://api.shutterstock.com/v2/images/licenses")
          throw new Error("Synthetic lost response");
        return response;
      },
    });
  await runPlanStage(s.env, queued.id, "planning", {
    ...deps,
    automaticReference: retrieval,
  });
  const unknown = (await s.call<JobDto>(`/jobs/${queued.id}`)).data;
  expect(unknown.status).toBe("outcome_unknown");
  expect(unknown.errorCode).toBe("SHUTTERSTOCK_LICENSE_UNCERTAIN");
  expect(unknown.attempts).toHaveLength(1);
  expect(unknown.attempts[0]?.stage).toBe("analysis");
  expect(JSON.parse(ledger(s, queued.id).metadata_json).licensing.status).toBe(
    "claimed",
  );
  await runPlanStage(s.env, queued.id, "planning", {
    ...deps,
    automaticReference: retrieval,
  });
  expect(source.licensePosts).toBe(1);
});
async function enqueueImage(
  s: Awaited<ReturnType<typeof readyStock>>,
  extra: Record<string, unknown> = {},
) {
  return s.call<JobDto>(`/products/${s.product.id}/generate`, "POST", {
    consent: true,
    idempotencyKey: crypto.randomUUID(),
    planId: s.planned.id,
    quality: "medium",
    count: 1,
    ...extra,
  });
}

test("stock source configuration is rejected before any job, AI attempt or source claim", async () => {
  for (const missing of [
    "SHUTTERSTOCK_ACCESS_TOKEN",
    "SHUTTERSTOCK_AGREEMENT_VERSION",
    "SHUTTERSTOCK_AI_REFERENCE_APPROVED",
  ] as const) {
    const s = await studioFixture();
    configure(s);
    delete s.env[missing];
    const result = await s.call<JobDto>(
      `/products/${s.product.id}/plan`,
      "POST",
      {
        ...s.planInput,
        useAutomaticReference: true,
      },
    );
    expect(result.status).toBe(503);
    expect(result.error?.code).toBe(
      missing === "SHUTTERSTOCK_ACCESS_TOKEN"
        ? "SHUTTERSTOCK_NOT_CONFIGURED"
        : "SHUTTERSTOCK_AGREEMENT_REQUIRED",
    );
    for (const table of [
      "generation_jobs",
      "generation_attempts",
      "reference_retrievals",
    ])
      expect(s.sqlite.query(`SELECT count(*) n FROM ${table}`).get()).toEqual({
        n: 0,
      });
    expect(s.workflows).toHaveLength(0);
  }
});

test("stock grant is persisted before download, reused without relicensing and isolated from another owner", async () => {
  const s = await studioFixture();
  configure(s);
  const queued = await startStock(s),
    source = fakeStock(s, queued.id),
    job = await jobRow(s, queued.id);
  const selected = await ensureAutomaticReference(
    s.env,
    job,
    mockAnalysisFixture,
    {
      fetch: source.fetcher,
      normalize: source.normalize,
    },
  );
  expect(selected.provider).toBe("shutterstock");
  expect(selected.status).toBe("selected");
  const first = ledger(s, job.id).metadata_json;
  expect(JSON.parse(first).licensing).toMatchObject({
    status: "licensed",
    actualCostUsd: null,
    grant: { mediaId, licenseId, agreementVersion: agreement },
  });
  const count = source.requests.length;
  expect(
    await ensureAutomaticReference(s.env, job, mockAnalysisFixture, {
      fetch: source.fetcher,
      normalize: source.normalize,
    }),
  ).toEqual(selected);
  expect(source.licensePosts).toBe(1);
  expect(source.requests).toHaveLength(count);
  expect(ledger(s, job.id).metadata_json).toBe(first);
  expect(JSON.stringify(selected)).not.toContain(licenseId);
  expect(JSON.stringify(selected)).not.toContain(agreement);
  expect(JSON.stringify(selected)).not.toContain("gatekeeper");
  const other = await s.login();
  const otherOwner = (
    s.sqlite.query("SELECT id FROM users WHERE id<>?").get(owner(s)) as {
      id: string;
    }
  ).id;
  expect(await getAutomaticReferences(s.env, otherOwner, s.product.id)).toEqual(
    [],
  );
  await expect(
    assertStockReferenceUsage(s.env, otherOwner, s.product.id, [job.id]),
  ).rejects.toMatchObject({ code: "SHUTTERSTOCK_POLICY_CHANGED" });
  expect(
    (
      await s.call(
        `/products/${s.product.id}/pipeline`,
        "GET",
        undefined,
        other,
      )
    ).status,
  ).toBe(404);
  expect(source.licensePosts).toBe(1);
  expect(
    s.sqlite.query("SELECT count(*) n FROM generation_attempts").get(),
  ).toEqual({ n: 0 });
});

test("stock planning and generation share exact licensed pixels, fashion role and non-training snapshot", async () => {
  const s = await readyStock();
  const queued = await enqueueImage(s, {
    editedPlan: {
      ...s.planned.spec,
      camera: {
        ...s.planned.spec.camera,
        angle: "Synthetic bird's-eye angle",
        referenceComposition: "match",
      },
    },
  });
  expect(queued.status).toBe(202);
  const captured = snapshot(s, queued.data.id);
  expect(captured.stockReferenceIds).toEqual([s.queued.id]);
  expect(captured.lookReferenceId).toBe(s.reference.assetId);
  expect(captured.lookReferenceKind).toBe("automatic_fashion");
  expect(captured.requireNonTraining).toBe(true);
  const adapter = mockAdapter(),
    generate = adapter.generate;
  let calls = 0;
  adapter.generate = async (...args) => {
    calls++;
    expect(args[4]?.lookImage).toBe(expectedImage);
    expect(args[4]?.lookReferenceKind).toBe("automatic_fashion");
    expect(args[4]?.requireNonTraining).toBe(true);
    expect(args[2].camera.angle).toBe("Synthetic bird's-eye angle");
    expect(args[2].camera.referenceComposition).toBe("match");
    return generate(...args);
  };
  await runGenerationStage(s.env, queued.data.id, "generation", {
    adapter: async () => adapter,
  });
  expect(calls).toBe(1);
  expect((await s.call<JobDto>(`/jobs/${queued.data.id}`)).data.status).toBe(
    "needs_review",
  );
  expect(s.source.licensePosts).toBe(1);
});

test("stock-derived revisions retain non-training lineage after opt-out and revocation blocks before AI", async () => {
  const s = await readyStock();
  const first = await enqueueImage(s);
  expect(first.status).toBe(202);
  await runGenerationStage(s.env, first.data.id, "generation", {
    adapter: async () => mockAdapter(),
  });
  const revision = await enqueueImage(s, {
    useAutomaticReference: false,
    regenerationOf: first.data.id,
    regenerationReason: "material_rendering",
    adjustments: "Synthetic softer folds",
  });
  expect(revision.status).toBe(202);
  const revised = snapshot(s, revision.data.id);
  expect(revised.lookReferenceId).toBeNull();
  expect(revised.stockReferenceIds).toEqual([s.queued.id]);
  expect(revised.requireNonTraining).toBe(true);
  const adapter = mockAdapter(),
    generate = adapter.generate;
  let calls = 0;
  adapter.generate = async (...args) => {
    calls++;
    expect(args[4]?.lookImage).toBeUndefined();
    expect(args[4]?.previousImage).toBeTruthy();
    expect(args[4]?.requireNonTraining).toBe(true);
    return generate(...args);
  };
  await runGenerationStage(s.env, revision.data.id, "generation", {
    adapter: async () => adapter,
  });
  expect(calls).toBe(1);
  const pending = await enqueueImage(s, {
    useAutomaticReference: false,
    regenerationOf: revision.data.id,
    regenerationReason: "lighting_focus",
    adjustments: "Synthetic contact shadow",
  });
  expect(pending.status).toBe(202);
  expect(snapshot(s, pending.data.id).stockReferenceIds).toEqual([s.queued.id]);
  s.env.SHUTTERSTOCK_AI_REFERENCE_APPROVED = "false";
  let resolutions = 0;
  await runGenerationStage(s.env, pending.data.id, "generation", {
    adapter: async () => {
      resolutions++;
      return mockAdapter();
    },
  });
  expect(resolutions).toBe(0);
  const failed = (await s.call<JobDto>(`/jobs/${pending.data.id}`)).data;
  expect(failed.status).toBe("failed");
  expect(failed.errorCode).toBe("SHUTTERSTOCK_POLICY_CHANGED");
  expect(failed.attempts).toEqual([]);
  expect(
    (
      await enqueueImage(s, {
        useAutomaticReference: false,
        regenerationOf: revision.data.id,
        regenerationReason: "lighting_focus",
      })
    ).status,
  ).toBe(409);
  expect(s.source.licensePosts).toBe(1);
});

test("licensed stock raw download is forbidden while its generated customer image remains downloadable", async () => {
  const s = await readyStock();
  const raw = await s.app.request(
    `/api/v1/assets/${s.reference.assetId}/download`,
    { headers: s.headers },
    s.env,
  );
  expect(raw.status).toBe(403);
  const failure = (await raw.json()) as { error: { code: string } };
  expect(failure.error.code).toBe("REFERENCE_DOWNLOAD_RESTRICTED");
  const preview = await s.app.request(
    `/api/v1/assets/${s.reference.assetId}/content`,
    { headers: s.headers },
    s.env,
  );
  expect(preview.status).toBe(200);
  expect(preview.headers.get("Content-Disposition")).toStartWith("inline");
  const queued = await enqueueImage(s);
  expect(queued.status).toBe(202);
  await runGenerationStage(s.env, queued.data.id, "generation", {
    adapter: async () => mockAdapter(),
  });
  const download = await s.app.request(
    `/api/v1/assets/${queued.data.id}/download`,
    { headers: s.headers },
    s.env,
  );
  expect(download.status).toBe(200);
  expect(download.headers.get("Content-Disposition")).toStartWith("attachment");
  expect(new Uint8Array(await download.arrayBuffer()).slice(0, 8)).toEqual(
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  expect(s.source.licensePosts).toBe(1);
});
