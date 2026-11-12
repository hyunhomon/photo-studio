import { expect, test, spyOn } from "bun:test";
import { studioFixture } from "../test/studio";
import { mockAnalysisFixture } from "../../../packages/ai/src/fixtures";
import { ensureAutomaticReference } from "./automatic-reference";
import type { JobRow } from "./pipeline";
import { createDb, jobs, eq } from "@photo-studio/db";

async function fixture() {
  const s = await studioFixture(),
    job = await s.startPlan();
  const row: JobRow | undefined = await createDb(s.env.DB)
    .select()
    .from(jobs)
    .where(eq(jobs.id, job.id))
    .get();
  if (!row) throw new Error("Missing synthetic job");
  return { ...s, job: row };
}

test("failed selection rolls back only its inserted auto asset and orphan media", async () => {
  const s = await fixture(),
    original = s.env.DB.batch.bind(s.env.DB);
  const batch = spyOn(s.env.DB, "batch").mockImplementationOnce(
    async (statements) => {
      const first = statements[0];
      if (!first) throw new Error("Missing synthetic persistence statement");
      return original([first, s.env.DB.prepare("SELECT 1")]);
    },
  );
  try {
    await expect(
      ensureAutomaticReference(s.env, s.job, mockAnalysisFixture),
    ).rejects.toMatchObject({ code: "JOB_CANCELLED" });
    expect(s.sqlite.query("SELECT count(*) n FROM assets").get()).toEqual({
      n: 1,
    });
    expect(s.objects.size).toBe(1);
    expect(
      s.sqlite.query("SELECT status FROM reference_retrievals").get(),
    ).toEqual({ status: "failed" });
  } finally {
    batch.mockRestore();
  }
});

test("a committed selection survives a lost D1 response and is reused without deleting its R2 image", async () => {
  const s = await fixture(),
    original = s.env.DB.batch.bind(s.env.DB);
  const batch = spyOn(s.env.DB, "batch").mockImplementationOnce(
    async (statements) => {
      await original(statements);
      throw new Error("Synthetic lost commit response");
    },
  );
  try {
    const selected = await ensureAutomaticReference(
      s.env,
      s.job,
      mockAnalysisFixture,
    );
    expect(selected.status).toBe("selected");
    expect(s.sqlite.query("SELECT count(*) n FROM assets").get()).toEqual({
      n: 2,
    });
    expect(s.objects.size).toBe(2);
    expect(
      await ensureAutomaticReference(s.env, s.job, mockAnalysisFixture),
    ).toEqual(selected);
  } finally {
    batch.mockRestore();
  }
});

test("unreadable commit state retains linked media and cleanup intent without claiming success or failure", async () => {
  const s = await fixture(),
    original = s.env.DB.batch.bind(s.env.DB),
    prepare = s.env.DB.prepare.bind(s.env.DB);
  let unavailable = false;
  const read = spyOn(s.env.DB, "prepare").mockImplementation((sql) => {
    if (
      unavailable &&
      /^\s*select/i.test(sql) &&
      /reference_retrievals/i.test(sql)
    )
      throw new Error("Synthetic database unavailable");
    return prepare(sql);
  });
  const batch = spyOn(s.env.DB, "batch").mockImplementationOnce(
    async (statements) => {
      await original(statements);
      unavailable = true;
      throw new Error("Synthetic lost commit response");
    },
  );
  try {
    await expect(
      ensureAutomaticReference(s.env, s.job, mockAnalysisFixture),
    ).rejects.toMatchObject({ code: "AUTO_REFERENCE_STORAGE_UNCERTAIN" });
    expect(s.sqlite.query("SELECT count(*) n FROM assets").get()).toEqual({
      n: 2,
    });
    expect(s.objects.size).toBe(2);
    expect(
      s.sqlite.query("SELECT status FROM reference_retrievals").get(),
    ).toEqual({ status: "selected" });
    expect(
      s.sqlite.query("SELECT count(*) n FROM storage_cleanup").get(),
    ).toEqual({ n: 1 });
  } finally {
    batch.mockRestore();
    read.mockRestore();
  }
});
