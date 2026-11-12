import { expect, test } from "bun:test";
import { studioFixture } from "../test/studio";
import { cleanupStorage, queueObject } from "./storage";

type Fixture = Awaited<ReturnType<typeof studioFixture>>;
const count = (s: Fixture, table: string) =>
  (s.sqlite.query(`SELECT count(*) n FROM ${table}`).get() as { n: number }).n;
function firstAsset(s: Fixture) {
  const asset = s.product.assets[0];
  if (!asset) throw new Error("Synthetic asset missing");
  return asset;
}

for (const kind of ["input", "generated", "person_reference"] as const) {
  test(`${kind} removal keeps a durable cleanup intent through an R2 outage and becomes inaccessible immediately`, async () => {
    const s = await studioFixture();
    const asset = firstAsset(s);
    s.sqlite.run("UPDATE assets SET kind=? WHERE id=?", [kind, asset.id]);
    const other = await s.login();
    expect(
      (await s.call(`/assets/${asset.id}`, "DELETE", undefined, other)).status,
    ).toBe(404);
    expect(count(s, "storage_cleanup")).toBe(0);
    const remove = s.env.ASSETS.delete.bind(s.env.ASSETS);
    s.env.ASSETS.delete = async () => {
      throw new Error("Synthetic R2 outage");
    };
    const response = await s.call(`/assets/${asset.id}`, "DELETE");
    expect(response.status).toBe(202);
    expect(response.data).toEqual({ deleted: true, cleanupPending: true });
    expect(count(s, "assets")).toBe(0);
    expect(count(s, "storage_cleanup")).toBe(1);
    expect(s.objects.size).toBe(1);
    const content = await s.app.request(
      `/api/v1/assets/${asset.id}/content`,
      { headers: s.headers },
      s.env,
    );
    expect(content.status).toBe(404);
    s.sqlite.exec("UPDATE storage_cleanup SET expires_at=0");
    await cleanupStorage(s.env);
    expect(count(s, "storage_cleanup")).toBe(1);
    s.env.ASSETS.delete = remove;
    await cleanupStorage(s.env);
    expect(count(s, "storage_cleanup")).toBe(0);
    expect(s.objects.size).toBe(0);
  });
}

test("asset row and cleanup intent roll back together before any R2 mutation", async () => {
  const s = await studioFixture();
  const asset = firstAsset(s);
  s.sqlite.exec(
    "CREATE TRIGGER synthetic_asset_delete_failure BEFORE DELETE ON assets BEGIN SELECT RAISE(ABORT,'synthetic deletion failure'); END",
  );
  let deletes = 0;
  s.env.ASSETS.delete = async () => {
    deletes++;
  };
  expect((await s.call(`/assets/${asset.id}`, "DELETE")).status).toBe(500);
  expect(count(s, "assets")).toBe(1);
  expect(count(s, "storage_cleanup")).toBe(0);
  expect(s.objects.size).toBe(1);
  expect(deletes).toBe(0);
});

for (const kind of ["input", "person_reference"] as const) {
  test(`${kind} deletion rechecks a job created after its initial guard without queuing or deleting media`, async () => {
    const s = await studioFixture();
    const asset = firstAsset(s);
    s.sqlite.run("UPDATE assets SET kind=? WHERE id=?", [kind, asset.id]);
    const owner = (
      s.sqlite
        .query("SELECT user_id FROM products WHERE id=?")
        .get(s.product.id) as { user_id: string }
    ).user_id;
    const batch = s.env.DB.batch.bind(s.env.DB);
    s.env.DB.batch = async (statements) => {
      s.env.DB.batch = batch;
      s.sqlite.run(
        "INSERT INTO generation_jobs(id,user_id,product_id,kind,status,stage,idempotency_key,request_hash,request_json,created_at) VALUES(?,?,?,'plan',?,'analysis',?,'synthetic-hash','{}',0)",
        [
          crypto.randomUUID(),
          owner,
          s.product.id,
          kind === "input" ? "completed" : "queued",
          crypto.randomUUID(),
        ],
      );
      return batch(statements);
    };
    const response = await s.call(`/assets/${asset.id}`, "DELETE");
    expect(response.status).toBe(409);
    expect(response.error?.code).toBe(
      kind === "input" ? "SOURCES_LOCKED" : "JOB_CONFLICT",
    );
    expect(count(s, "assets")).toBe(1);
    expect(count(s, "storage_cleanup")).toBe(0);
    expect(s.objects.size).toBe(1);
  });
}

test("expired pending-upload cleanup never removes a valid committed asset", async () => {
  const s = await studioFixture();
  const asset = firstAsset(s);
  const row = s.sqlite
    .query("SELECT r2_key FROM assets WHERE id=?")
    .get(asset.id) as { r2_key: string };
  await queueObject(s.env, row.r2_key);
  s.sqlite.exec("UPDATE storage_cleanup SET expires_at=0");
  await cleanupStorage(s.env);
  expect(count(s, "storage_cleanup")).toBe(0);
  expect(count(s, "assets")).toBe(1);
  expect(s.objects.size).toBe(1);
});
