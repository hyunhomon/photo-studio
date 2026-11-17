import { expect, test } from "bun:test";
import { studioFixture } from "../test/studio";
import { syntheticPng } from "../test/png";
import { runPlanStage } from "./pipeline";
import { runGenerationStage } from "./generation";
import { mockAdapter, ProviderError } from "@photo-studio/ai";
import type { JobDto, ProductDto, ResultDto } from "@photo-studio/schemas";

test("a committed upload returns its product after queue failure; an explicit retry uses that product and never duplicates its job", async () => {
  const s = await studioFixture();
  const prepare = s.env.DB.prepare.bind(s.env.DB);
  let fail = true;
  s.env.DB.prepare = (sql: string) => {
    if (fail && sql.startsWith("INSERT OR IGNORE INTO generation_jobs")) {
      fail = false;
      throw new Error("Synthetic queue outage");
    }
    return prepare(sql);
  };
  const form = new FormData();
  const key = crypto.randomUUID();
  form.set("startShoot", "true");
  form.set("idempotencyKey", key);
  form.set(
    "images",
    new File([new Uint8Array(syntheticPng()).buffer], "synthetic.png", {
      type: "image/png",
    }),
  );
  const created = await s.call<ProductDto>("/products", "POST", form);
  expect(created.status).toBe(201);
  expect(created.data.startupError).toBe(true);
  s.env.DB.prepare = prepare;
  const retry = await s.call<JobDto>(
    `/products/${created.data.id}/shoot`,
    "POST",
    { idempotencyKey: key },
  );
  const replay = await s.call<JobDto>(
    `/products/${created.data.id}/shoot`,
    "POST",
    { idempotencyKey: key },
  );
  expect(retry.status).toBe(202);
  expect(replay.data.id).toBe(retry.data.id);
  expect(
    s.sqlite.query("SELECT count(*) n FROM generation_jobs").get(),
  ).toEqual({ n: 1 });
  expect(s.sqlite.query("SELECT count(*) n FROM products").get()).toEqual({
    n: 2,
  });
});

test("one upload execution queues a durable shoot and all three stages run once with garment and selected references", async () => {
  const s = await studioFixture();
  const form = new FormData();
  form.set("startShoot", "true");
  form.set("idempotencyKey", crypto.randomUUID());
  form.set("rightsConfirmed", "true");
  for (const field of ["images", "lookImage", "personImage"])
    form.append(
      field,
      new File([new Uint8Array(syntheticPng()).buffer], "synthetic.png", {
        type: "image/png",
      }),
    );
  const created = await s.call<ProductDto>("/products", "POST", form);
  expect(created.status).toBe(201);
  expect(created.data.startupError).toBeUndefined();
  const row = s.sqlite
    .query(
      "SELECT id,kind,request_json FROM generation_jobs WHERE product_id=?",
    )
    .get(created.data.id) as { id: string; kind: string; request_json: string };
  expect(row.kind).toBe("shoot");
  expect(JSON.parse(row.request_json)).toMatchObject({
    autoGenerate: true,
    useAutomaticReference: false,
    referenceConsent: true,
    imageModel: "mock/reference-copy-v1",
  });
  const adapter = mockAdapter();
  let calls = 0;
  const generate = adapter.generate;
  adapter.generate = async (...args) => {
    calls++;
    expect(args[1]).toHaveLength(1);
    expect(args[4]?.personImage).toBeTruthy();
    expect(args[4]?.lookImage).toBeTruthy();
    return generate(...args);
  };
  const deps = { adapter: async () => adapter };
  await runPlanStage(s.env, row.id, "analysis", deps);
  await runPlanStage(s.env, row.id, "planning", deps);
  expect(
    s.sqlite.query("SELECT status FROM generation_jobs WHERE id=?").get(row.id),
  ).toMatchObject({ status: "running" });
  expect(
    s.sqlite.query("SELECT status FROM shoot_plans WHERE id=?").get(row.id),
  ).toEqual({ status: "approved" });
  await runGenerationStage(s.env, row.id, "generation", deps);
  const results = (
    await s.call<ResultDto[]>(`/products/${created.data.id}/results`)
  ).data;
  expect(results).toHaveLength(1);
  expect(results[0]).toMatchObject({
    personReferenceUsed: true,
    lookReferenceUsed: true,
  });
  const job = (await s.call<JobDto>(`/jobs/${row.id}`)).data;
  expect(job.status).toBe("needs_review");
  expect(job.attempts.map((a) => a.stage)).toEqual([
    "analysis",
    "planning",
    "generation",
  ]);
  // Re-delivery after terminal completion cannot issue a second inference.
  await runGenerationStage(s.env, row.id, "generation", deps);
  expect(calls).toBe(1);
});

test("a cancelled or failed one-click shoot never continues to a paid later stage; queue retries are idempotent and owner scoped", async () => {
  for (const mode of ["cancel", "analysis failure"]) {
    const s = await studioFixture();
    const key = crypto.randomUUID();
    const job = (
      await s.call<JobDto>(`/products/${s.product.id}/shoot`, "POST", {
        idempotencyKey: key,
      })
    ).data;
    expect(
      (
        await s.call<JobDto>(`/products/${s.product.id}/shoot`, "POST", {
          idempotencyKey: key,
        })
      ).data.id,
    ).toBe(job.id);
    const other = await s.login();
    expect(
      (
        await s.call(
          `/products/${s.product.id}/shoot`,
          "POST",
          { idempotencyKey: crypto.randomUUID() },
          other,
        )
      ).status,
    ).toBe(404);
    const adapter = mockAdapter();
    let calls = 0;
    adapter.generate = async () => {
      calls++;
      throw Error("Unexpected inference");
    };
    if (mode === "cancel")
      s.sqlite.run("UPDATE generation_jobs SET status='cancelled' WHERE id=?", [
        job.id,
      ]);
    else
      adapter.analyze = async () => {
        throw new ProviderError("SYNTHETIC_ANALYSIS_FAILURE");
      };
    const deps = { adapter: async () => adapter };
    await runPlanStage(s.env, job.id, "analysis", deps);
    await runPlanStage(s.env, job.id, "planning", deps);
    await runGenerationStage(s.env, job.id, "generation", deps);
    expect(calls).toBe(0);
    expect(
      s.sqlite
        .query("SELECT count(*) n FROM assets WHERE kind='generated'")
        .get(),
    ).toEqual({ n: 0 });
  }
});
