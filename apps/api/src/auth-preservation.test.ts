import { expect, test } from "bun:test";
import { studioFixture } from "../test/studio";
import { authSubjectHash } from "./auth-audit";
import { cleanupIdentity } from "./auth";
import {
  captureAuth,
  verifyAuth,
  type AuthQuery,
} from "../../../scripts/auth-preservation";

async function fixture() {
  const s = await studioFixture();
  const owner = s.sqlite
    .query("SELECT user_id FROM products WHERE id=?")
    .get(s.product.id) as { user_id: string };
  // Real-account shape with fake credentials only; no provider is ever invoked.
  s.sqlite.run("UPDATE users SET is_test=0 WHERE id=?", [owner.user_id]);
  s.sqlite.run(
    "UPDATE provider_connections SET provider='openrouter' WHERE user_id=?",
    [owner.user_id],
  );
  const query: AuthQuery = async <T>(sql: string, params: unknown[] = []) =>
    s.sqlite.query(sql).all(...(params as [])) as T[];
  const key = s.env.APP_ENCRYPTION_KEY_B64;
  if (!key) throw new Error("Synthetic fixture encryption key missing");
  return {
    ...s,
    owner: owner.user_id,
    query,
    key,
  };
}

test("synthetic logout/account deletion and read-only deploy probes preserve unrelated real-shaped auth byte for byte", async () => {
  const s = await fixture(),
    before = await captureAuth(s.query, s.key);
  const synthetic = await s.login();
  expect(
    (
      await s.app.request(
        "/auth/logout",
        { method: "POST", headers: synthetic },
        s.env,
      )
    ).status,
  ).toBe(200);
  const other = await s.login();
  expect(
    (await s.call("/account", "DELETE", { confirm: "DELETE" }, other)).status,
  ).toBe(200);
  await s.env.DB.prepare("SELECT 1 AS ok").first();
  expect(await verifyAuth(s.query, s.key, before)).toEqual({
    unchanged: 1,
    explicitChanges: 0,
  });
  expect((await s.call("/me")).status).toBe(200);
  const events = s.sqlite
    .query(
      "SELECT * FROM auth_lifecycle_events WHERE event IN ('credentials_disconnected','account_deleted')",
    )
    .all() as { is_test: number; subject_hash: string }[];
  expect(events).toHaveLength(2);
  expect(events.every((event) => event.is_test === 1)).toBe(true);
  const audit = JSON.stringify(events);
  for (const sensitive of [
    s.owner,
    s.headers.Cookie,
    s.headers["X-CSRF-Token"],
    s.key,
  ])
    expect(audit).not.toContain(sensitive);
});

test("explicit real-shaped logout explains exactly the key and session disappearance, while unaudited deletion fails the guard", async () => {
  const s = await fixture(),
    before = await captureAuth(s.query, s.key);
  expect(
    (
      await s.app.request(
        "/auth/logout",
        { method: "POST", headers: s.headers },
        s.env,
      )
    ).status,
  ).toBe(200);
  expect(
    s.sqlite
      .query(
        "SELECT event,reason,is_test,connections_affected,sessions_affected FROM auth_lifecycle_events WHERE event='credentials_disconnected'",
      )
      .get(),
  ).toEqual({
    event: "credentials_disconnected",
    reason: "explicit_logout",
    is_test: 0,
    connections_affected: 1,
    sessions_affected: 1,
  });
  expect(
    (
      s.sqlite
        .query(
          "SELECT subject_hash FROM auth_lifecycle_events WHERE event='credentials_disconnected'",
        )
        .get() as { subject_hash: string }
    ).subject_hash,
  ).toBe(await authSubjectHash(s.env, s.owner));
  expect(await verifyAuth(s.query, s.key, before)).toEqual({
    unchanged: 0,
    explicitChanges: 1,
  });
  const untracked = await fixture(),
    original = await captureAuth(untracked.query, untracked.key);
  untracked.sqlite.run("DELETE FROM provider_connections");
  untracked.sqlite.run("DELETE FROM sessions");
  await expect(
    verifyAuth(untracked.query, untracked.key, original),
  ).rejects.toThrow("without a matching lifecycle event");
});

test("expiry removes only expired sessions, preserves keys and has distinct evidence; failed logout does not claim a removal", async () => {
  const s = await fixture();
  s.sqlite.run("UPDATE sessions SET expires_at=? WHERE user_id=?", [
    Date.now() - 1,
    s.owner,
  ]);
  const before = await captureAuth(s.query, s.key);
  await cleanupIdentity(s.env);
  expect(
    s.sqlite.query("SELECT count(*) n FROM provider_connections").get(),
  ).toEqual({ n: 1 });
  expect(
    s.sqlite
      .query(
        "SELECT reason,connections_affected,sessions_affected FROM auth_lifecycle_events WHERE event='session_expired'",
      )
      .get(),
  ).toEqual({
    reason: "scheduled_expiry",
    connections_affected: 0,
    sessions_affected: 1,
  });
  expect(await verifyAuth(s.query, s.key, before)).toEqual({
    unchanged: 0,
    explicitChanges: 1,
  });
  const rollback = await fixture();
  rollback.sqlite.exec(
    "CREATE TRIGGER synthetic_delete_failure BEFORE DELETE ON sessions BEGIN SELECT RAISE(ABORT, 'Synthetic failure'); END",
  );
  expect(
    (
      await rollback.app.request(
        "/auth/logout",
        { method: "POST", headers: rollback.headers },
        rollback.env,
      )
    ).status,
  ).toBe(500);
  expect(
    rollback.sqlite
      .query(
        "SELECT count(*) n FROM auth_lifecycle_events WHERE event='credentials_disconnected'",
      )
      .get(),
  ).toEqual({ n: 0 });
  expect(
    rollback.sqlite.query("SELECT count(*) n FROM provider_connections").get(),
  ).toEqual({ n: 1 });
});
