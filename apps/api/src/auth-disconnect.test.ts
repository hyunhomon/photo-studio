import { expect, test } from "bun:test";
import { hash } from "./crypto";
import { studioFixture } from "../test/studio";
import { runPlanStage } from "./pipeline";
import { mockAdapter } from "@photo-studio/ai";

for (const path of ["/auth/logout", "/auth/disconnect"]) {
  test(`${path} disconnects credentials and all sessions, cancels only owned active work and keeps products`, async () => {
    const s = await studioFixture();
    const owner = s.sqlite
      .query("SELECT user_id FROM products WHERE id=?")
      .get(s.product.id) as { user_id: string };
    const secondToken = "synthetic-second-browser-session";
    s.sqlite.run(
      "INSERT INTO sessions(id,user_id,token_hash,csrf,expires_at,created_at) VALUES(?,?,?,?,?,?)",
      [
        crypto.randomUUID(),
        owner.user_id,
        await hash(secondToken),
        "synthetic-second-csrf",
        Date.now() + 60000,
        Date.now(),
      ],
    );
    const other = await s.login();
    const otherOwner = s.sqlite
      .query("SELECT id FROM users WHERE id!=?")
      .get(owner.user_id) as { id: string };
    const otherProduct = crypto.randomUUID();
    s.sqlite.run(
      "INSERT INTO products(id,user_id,name,status,name_source,created_at) VALUES(?,?,'Synthetic other garment','ready','manual',0)",
      [otherProduct, otherOwner.id],
    );
    const job = await s.startPlan();
    s.sqlite.run("UPDATE generation_jobs SET status='running' WHERE id=?", [
      job.id,
    ]);
    s.sqlite.run(
      "INSERT INTO generation_attempts(id,user_id,job_id,stage,model,status,request_hash,prompt_version,created_at) VALUES(?,?,?,'analysis','synthetic/mock','started','synthetic-hash','synthetic-v1',0)",
      [crypto.randomUUID(), owner.user_id, job.id],
    );
    // Model a different user's already queued work without invoking any provider.
    const otherJob = crypto.randomUUID();
    s.sqlite.run(
      "INSERT INTO generation_jobs(id,user_id,product_id,kind,status,stage,idempotency_key,request_hash,request_json,created_at) VALUES(?,?,?,'plan','queued','analysis',?,'synthetic-other-hash','{}',0)",
      [otherJob, otherOwner.id, otherProduct, crypto.randomUUID()],
    );
    let terminations = 0;
    s.env.STUDIO_WORKFLOW.get = async () =>
      ({
        terminate: async () => {
          terminations++;
          throw new Error("Synthetic control-plane unavailable");
        },
      }) as never;
    const response = await s.app.request(
      path,
      { method: "POST", headers: s.headers },
      s.env,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        loggedOut: true,
        disconnected: true,
        providerRevocationRequired: true,
      },
    });
    expect(response.headers.get("set-cookie")).toContain("ps_session=;");
    expect(
      s.sqlite
        .query("SELECT count(*) n FROM provider_connections WHERE user_id=?")
        .get(owner.user_id),
    ).toEqual({ n: 0 });
    expect(
      s.sqlite
        .query("SELECT count(*) n FROM sessions WHERE user_id=?")
        .get(owner.user_id),
    ).toEqual({ n: 0 });
    expect(
      s.sqlite
        .query("SELECT count(*) n FROM provider_connections WHERE user_id=?")
        .get(otherOwner.id),
    ).toEqual({ n: 1 });
    expect(
      s.sqlite
        .query("SELECT status FROM generation_jobs WHERE id=?")
        .get(job.id),
    ).toEqual({ status: "cancelled" });
    expect(
      s.sqlite
        .query("SELECT status FROM generation_jobs WHERE id=?")
        .get(otherJob),
    ).toEqual({ status: "queued" });
    expect(
      s.sqlite
        .query("SELECT status FROM generation_attempts WHERE job_id=?")
        .get(job.id),
    ).toEqual({ status: "outcome_unknown" });
    expect(terminations).toBe(1);
    expect((await s.call("/me")).status).toBe(401);
    expect(
      (
        await s.call("/me", "GET", undefined, {
          ...s.headers,
          Cookie: `ps_session=${secondToken}`,
        })
      ).status,
    ).toBe(401);
    expect((await s.call("/me", "GET", undefined, other)).status).toBe(200);
    expect(
      s.sqlite
        .query("SELECT count(*) n FROM products WHERE id=?")
        .get(s.product.id),
    ).toEqual({ n: 1 });
    expect(s.objects.size).toBe(1);
    let adapterResolutions = 0;
    await runPlanStage(s.env, job.id, "analysis", {
      adapter: async () => {
        adapterResolutions++;
        return mockAdapter();
      },
    });
    expect(adapterResolutions).toBe(0);
  });
}

test("logout cannot bypass Origin/CSRF and a failed session deletion rolls back key removal for retry", async () => {
  const s = await studioFixture();
  for (const path of ["/auth/logout", "/auth/disconnect"]) {
    for (const headers of [
      { ...s.headers, Origin: "https://untrusted.invalid" },
      { ...s.headers, "X-CSRF-Token": "wrong" },
    ]) {
      expect(
        (await s.app.request(path, { method: "POST", headers }, s.env)).status,
      ).toBe(403);
    }
  }
  s.sqlite.exec(
    "CREATE TRIGGER synthetic_session_delete_failure BEFORE DELETE ON sessions BEGIN SELECT RAISE(ABORT, 'Synthetic session storage failure'); END",
  );
  const failed = await s.app.request(
    "/auth/logout",
    { method: "POST", headers: s.headers },
    s.env,
  );
  expect(failed.status).toBe(500);
  expect(failed.headers.get("set-cookie")).toBeNull();
  expect(
    s.sqlite.query("SELECT count(*) n FROM provider_connections").get(),
  ).toEqual({ n: 1 });
  expect((await s.call("/me")).status).toBe(200);
  s.sqlite.exec("DROP TRIGGER synthetic_session_delete_failure");
  expect(
    (
      await s.app.request(
        "/auth/logout",
        { method: "POST", headers: s.headers },
        s.env,
      )
    ).status,
  ).toBe(200);
  expect((await s.call("/me")).status).toBe(401);
});
