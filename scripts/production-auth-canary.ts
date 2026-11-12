import { resolve } from "node:path";
import { unlink } from "node:fs/promises";
import { captureAuth, verifyAuth } from "./auth-preservation";

// This disposable is_test account has no customer key and never starts inference.
const root = resolve(import.meta.dir, ".."),
  statePath = resolve(root, ".wrangler/production/auth-canary.json");
type Canary = {
  userId: string;
  sessionId: string;
  connectionId: string;
  token: string;
  csrf: string;
  envelope: string;
  createdAt: number;
};
async function main() {
  const action = process.argv[2];
  if (!["create", "verify", "cleanup"].includes(action ?? ""))
    throw new Error("Use production-auth-canary.ts create|verify|cleanup.");
  const config = (await Bun.file(
    resolve(root, ".wrangler/production/api.json"),
  ).json()) as { account_id: string; d1_databases: { database_id: string }[] };
  const databaseId = config.d1_databases[0]?.database_id;
  if (!databaseId) throw new Error("Missing pinned production database.");
  const identity = (await Bun.file(
    resolve(root, ".wrangler/production/identity.json"),
  ).json()) as { accountId: string };
  if (identity.accountId !== config.account_id)
    throw new Error("Production canary account differs from pinned identity.");
  const auth = Bun.spawn(
    [
      "node",
      resolve(root, "apps/api/node_modules/wrangler/bin/wrangler.js"),
      "auth",
      "token",
      "--json",
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const credential = JSON.parse(await new Response(auth.stdout).text()) as {
    token: string;
  };
  if ((await auth.exited) !== 0 || !credential.token)
    throw new Error("Cloudflare login required.");
  const backup = (await Bun.file(
    resolve(root, ".wrangler/production/encryption-key.json"),
  ).json()) as { key: string; version: string };
  async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${identity.accountId}/d1/database/${databaseId}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credential.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sql, params }),
        signal: AbortSignal.timeout(30000),
      },
    );
    const body = (await response.json()) as {
      success: boolean;
      result: { success: boolean; results: T[] }[];
    };
    if (!response.ok || !body.success || body.result.some((r) => !r.success))
      throw new Error("Synthetic canary database operation failed.");
    return body.result.flatMap((r) => r.results);
  }
  const file = Bun.file(statePath);
  let canary: Canary;
  if (action === "create") {
    if (await file.exists())
      throw new Error(
        "An auth canary already exists. Verify or cleanup it before creating another.",
      );
    const userId = crypto.randomUUID(),
      iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await crypto.subtle.importKey(
      "raw",
      Uint8Array.from(atob(backup.key), (c) => c.charCodeAt(0)),
      "AES-GCM",
      false,
      ["encrypt"],
    );
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: new TextEncoder().encode(`provider:${userId}`),
      },
      key,
      new TextEncoder().encode("synthetic-canary-no-provider-key"),
    );
    canary = {
      userId,
      sessionId: crypto.randomUUID(),
      connectionId: crypto.randomUUID(),
      token: crypto.randomUUID() + crypto.randomUUID(),
      csrf: crypto.randomUUID(),
      envelope: JSON.stringify({
        version: 1,
        kid: backup.version,
        iv: btoa(String.fromCharCode(...iv)),
        ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
      }),
      createdAt: Date.now(),
    };
    // Persist only disposable synthetic test data in an ignored path, before seeding for recoverable cleanup.
    await Bun.write(file, JSON.stringify(canary));
    await query(
      "INSERT INTO users(id,openrouter_user_id,is_test,created_at,last_login_at) VALUES(?,?,1,?,?)",
      [
        canary.userId,
        `mock-production-canary:${canary.userId}`,
        canary.createdAt,
        canary.createdAt,
      ],
    );
    await query(
      "INSERT INTO provider_connections(id,user_id,provider,key_envelope,linked_at) VALUES(?,?,'mock',?,?)",
      [canary.connectionId, canary.userId, canary.envelope, canary.createdAt],
    );
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(canary.token),
    );
    const tokenHash = [...new Uint8Array(hash)]
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("");
    await query(
      "INSERT INTO sessions(id,user_id,token_hash,csrf,created_at,expires_at) VALUES(?,?,?,?,?,?)",
      [
        canary.sessionId,
        canary.userId,
        tokenHash,
        canary.csrf,
        canary.createdAt,
        canary.createdAt + 86400000,
      ],
    );
    console.info(
      "PASS: created a disposable non-empty synthetic auth canary; no provider calls.",
    );
    return;
  }
  canary = (await file.json()) as Canary;
  const row = await query<{ n: number }>(
    "SELECT count(*) n FROM users WHERE id=? AND is_test=1 AND openrouter_user_id=?",
    [canary.userId, `mock-production-canary:${canary.userId}`],
  );
  if (row[0]?.n !== 1)
    throw new Error(
      "Canary identity is absent or not the disposable synthetic account; refusing mutation.",
    );
  if (action === "cleanup") {
    await query(
      "DELETE FROM users WHERE id=? AND is_test=1 AND openrouter_user_id=?",
      [canary.userId, `mock-production-canary:${canary.userId}`],
    );
    const auditTable = await query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='auth_lifecycle_events'",
    );
    if (auditTable.length) {
      const bytes = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          `${backup.key}:auth-subject:v1:${canary.userId}`,
        ),
      );
      const subjectHash = [...new Uint8Array(bytes)]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("");
      await query(
        "DELETE FROM auth_lifecycle_events WHERE subject_hash=? AND is_test=1",
        [subjectHash],
      );
    }
    await unlink(statePath);
    console.info(
      "PASS: removed only the disposable auth canary and ignored state file.",
    );
    return;
  }
  const snapshot = await captureAuth(query, backup.key, canary.userId);
  const value = [...snapshot.state.values()][0];
  if (
    !value ||
    snapshot.state.size !== 1 ||
    value.connectionCount !== 1 ||
    value.sessionCount !== 1
  )
    throw new Error("Canary lost its synthetic connection or session.");
  await verifyAuth(query, backup.key, snapshot, canary.userId);
  const tokenBytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canary.token),
  );
  const expectedTokenHash = [...new Uint8Array(tokenBytes)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
  const unchanged = await query<{ n: number }>(
    "SELECT count(*) n FROM provider_connections c JOIN sessions s ON s.user_id=c.user_id WHERE c.id=? AND c.user_id=? AND c.provider='mock' AND c.key_envelope=? AND c.linked_at=? AND c.revoked_at IS NULL AND s.id=? AND s.token_hash=? AND s.csrf=? AND s.created_at=? AND s.expires_at=?",
    [
      canary.connectionId,
      canary.userId,
      canary.envelope,
      canary.createdAt,
      canary.sessionId,
      expectedTokenHash,
      canary.csrf,
      canary.createdAt,
      canary.createdAt + 86400000,
    ],
  );
  if (unchanged[0]?.n !== 1) throw new Error("Canary auth contents changed.");
  console.info(
    "PASS: synthetic canary still has its original connection and session contents; no customer data printed.",
  );
}
if (import.meta.main) await main();
