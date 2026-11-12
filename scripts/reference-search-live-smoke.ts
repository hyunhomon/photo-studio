import { resolve } from "node:path";
import { mkdir, unlink } from "node:fs/promises";
import production from "../infra/production.json";
import { mockAnalysisFixture } from "../packages/ai/src/fixtures";
import { captureAuth, verifyAuth } from "./auth-preservation";

// Operator-only, real Commons HTTP through the deployed Workflow. No inference
// credentials are created: even an accidental AI-stage dispatch must fail closed.
const root = resolve(import.meta.dir, ".."),
  statePath = resolve(root, ".wrangler/production/reference-live-smoke.json"),
  origin = `https://${production.hostname}`;
interface SmokeState {
  userId: string;
  productId: string;
  jobId: string;
  sessionToken: string;
  csrf: string;
}
interface Envelope<T> {
  success: boolean;
  result: T;
}

class SmokeFailure extends Error {}

async function hash(value: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function main() {
  const action = process.argv[2] ?? "run";
  if (!["run", "cleanup"].includes(action))
    throw new SmokeFailure("Use reference-search-live-smoke.ts run|cleanup.");
  const pinned = (await Bun.file(
    resolve(root, ".wrangler/production/identity.json"),
  ).json()) as { accountId: string };
  const config = (await Bun.file(
    resolve(root, ".wrangler/production/api.json"),
  ).json()) as {
    account_id: string;
    d1_databases: { database_id: string; database_name: string }[];
    workflows: { name: string }[];
  };
  const database = config.d1_databases.find(
    (db) => db.database_name === production.database,
  );
  if (
    pinned.accountId !== config.account_id ||
    !database ||
    !config.workflows.some((flow) => flow.name === production.workflow)
  )
    throw new SmokeFailure(
      "Live reference probe differs from pinned production identity.",
    );
  const databaseId = database.database_id;
  const cli = resolve(root, "apps/api/node_modules/wrangler/bin/wrangler.js");
  // whoami refreshes an expired CLI access token without printing identity data.
  const who = Bun.spawn(["node", cli, "whoami", "--json"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [, , whoCode] = await Promise.all([
    new Response(who.stdout).text(),
    new Response(who.stderr).text(),
    who.exited,
  ]);
  if (whoCode !== 0) throw new SmokeFailure("Cloudflare login required.");
  const credential = Bun.spawn(["node", cli, "auth", "token", "--json"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [credentialText, , credentialCode] = await Promise.all([
    new Response(credential.stdout).text(),
    new Response(credential.stderr).text(),
    credential.exited,
  ]);
  if (credentialCode !== 0)
    throw new SmokeFailure("Cloudflare login required.");
  const { token } = JSON.parse(credentialText) as { token: string };
  if (!token) throw new SmokeFailure("Cloudflare login required.");
  const backup = (await Bun.file(
    resolve(root, ".wrangler/production/encryption-key.json"),
  ).json()) as { key: string };

  async function admin<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${pinned.accountId}${path}`,
      {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...init.headers,
        },
        signal: AbortSignal.timeout(30000),
      },
    );
    const body = (await response.json()) as Envelope<T>;
    if (!response.ok || !body.success)
      throw new SmokeFailure(
        `Live reference admin operation failed: HTTP ${response.status}.`,
      );
    return body.result;
  }
  async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await admin<{ success: boolean; results: T[] }[]>(
      `/d1/database/${databaseId}/query`,
      { method: "POST", body: JSON.stringify({ sql, params }) },
    );
    if (result.some((row) => !row.success))
      throw new SmokeFailure("Live reference database operation failed.");
    return result.flatMap((row) => row.results);
  }
  const baseline = await captureAuth(query, backup.key);
  const file = Bun.file(statePath);
  let state: SmokeState | undefined;
  let failure: unknown;
  let passed = false;
  try {
    if (action === "cleanup") {
      if (!(await file.exists()))
        throw new SmokeFailure(
          "No interrupted live reference probe to clean up.",
        );
      state = (await file.json()) as SmokeState;
    } else {
      if (await file.exists())
        throw new SmokeFailure(
          "Interrupted live reference probe exists; run cleanup first.",
        );
      state = {
        userId: crypto.randomUUID(),
        productId: crypto.randomUUID(),
        jobId: crypto.randomUUID(),
        sessionToken: crypto.randomUUID() + crypto.randomUUID(),
        csrf: crypto.randomUUID(),
      };
      await mkdir(resolve(statePath, ".."), { recursive: true });
      await Bun.write(statePath, JSON.stringify(state));
      const now = Date.now();
      await query(
        "INSERT INTO users(id,openrouter_user_id,is_test,created_at,last_login_at) VALUES(?,?,1,?,?)",
        [state.userId, `mock-reference-live:${state.userId}`, now, now],
      );
      await query(
        "INSERT INTO sessions(id,user_id,token_hash,csrf,created_at,expires_at) SELECT ?,u.id,?,?,?,? FROM users u WHERE u.id=? AND u.is_test=1 AND u.openrouter_user_id=?",
        [
          crypto.randomUUID(),
          await hash(state.sessionToken),
          state.csrf,
          now,
          now + 3600000,
          state.userId,
          `mock-reference-live:${state.userId}`,
        ],
      );
      await query(
        "INSERT INTO products(id,user_id,name,status,name_source,created_at) SELECT ?,u.id,'Synthetic reference retrieval probe','ready','manual',? FROM users u WHERE u.id=? AND u.is_test=1 AND u.openrouter_user_id=?",
        [
          state.productId,
          now,
          state.userId,
          `mock-reference-live:${state.userId}`,
        ],
      );
      const snapshot = {
        analysisSnapshot: mockAnalysisFixture,
        sourceIds: [],
        useAutomaticReference: true,
        referenceOnlyProbe: true,
      };
      await query(
        "INSERT INTO generation_jobs(id,user_id,product_id,kind,status,stage,idempotency_key,request_hash,request_json,created_at) SELECT ?,u.id,p.id,'plan','queued','queued',?,?,?,? FROM users u JOIN products p ON p.user_id=u.id WHERE u.id=? AND u.is_test=1 AND u.openrouter_user_id=? AND p.id=?",
        [
          state.jobId,
          crypto.randomUUID(),
          await hash(JSON.stringify(snapshot)),
          JSON.stringify(snapshot),
          now,
          state.userId,
          `mock-reference-live:${state.userId}`,
          state.productId,
        ],
      );
      await admin(`/workflows/${production.workflow}/instances`, {
        method: "POST",
        body: JSON.stringify({
          instance_id: state.jobId,
          params: JSON.stringify({
            kind: "reference-search-smoke",
            jobId: state.jobId,
          }),
        }),
      });
      const deadline = Date.now() + 180000;
      let terminal = false;
      while (Date.now() < deadline) {
        const jobs = await query<{ status: string; error_code: string | null }>(
          "SELECT status,error_code FROM generation_jobs WHERE id=? AND user_id=? AND product_id=?",
          [state.jobId, state.userId, state.productId],
        );
        const job = jobs[0];
        if (!job)
          throw new SmokeFailure("Synthetic reference probe job disappeared.");
        if (job.status === "completed") {
          terminal = true;
          break;
        }
        if (!["queued", "running"].includes(job.status)) {
          const safeCode = /^[A-Z_]{1,80}$/.test(job.error_code ?? "")
            ? job.error_code
            : "REFERENCE_PROBE_FAILED";
          throw new SmokeFailure(
            `Cloudflare reference retrieval did not complete: ${safeCode}.`,
          );
        }
        await Bun.sleep(2000);
      }
      if (!terminal)
        throw new SmokeFailure("Cloudflare reference retrieval timed out.");
      const rows = await query<{
        status: string;
        provider: string;
        asset_id: string | null;
        metadata_json: string | null;
      }>(
        "SELECT status,provider,asset_id,metadata_json FROM reference_retrievals WHERE id=? AND user_id=? AND product_id=?",
        [state.jobId, state.userId, state.productId],
      );
      const retrieval = rows[0];
      if (
        retrieval?.status !== "selected" ||
        !/wikimedia/i.test(retrieval.provider) ||
        !retrieval.asset_id ||
        !retrieval.metadata_json?.includes(
          "creativecommons.org/publicdomain/zero/1.0",
        )
      )
        throw new SmokeFailure(
          "Live retrieval did not retain a verified CC0 source and asset.",
        );
      const attempts = await query<{ n: number }>(
        "SELECT count(*) n FROM generation_attempts WHERE job_id=? AND user_id=?",
        [state.jobId, state.userId],
      );
      if (attempts[0]?.n !== 0)
        throw new SmokeFailure(
          "Reference-only probe unexpectedly entered an AI attempt.",
        );
      const media = await fetch(
        `${origin}/api/v1/assets/${retrieval.asset_id}/content`,
        {
          headers: { Cookie: `__Host-ps_session=${state.sessionToken}` },
          redirect: "manual",
          signal: AbortSignal.timeout(30000),
        },
      );
      const bytes = await media.arrayBuffer();
      if (
        !media.ok ||
        !/^image\/(png|jpeg|webp)/.test(
          media.headers.get("content-type") ?? "",
        ) ||
        bytes.byteLength < 32 ||
        bytes.byteLength > 10 * 1024 * 1024
      )
        throw new SmokeFailure(
          "Retrieved photo was not available through the private R2 read path.",
        );
      passed = true;
      console.info(
        "PASS: deployed Cloudflare Workflow fetched a real CC0 Wikimedia photo, retained provenance and read the private R2 asset; AI attempts: 0.",
      );
    }
  } catch (error) {
    failure = error;
  }
  try {
    if (state) {
      const own = await query<{ n: number }>(
        "SELECT count(*) n FROM users WHERE id=? AND is_test=1 AND openrouter_user_id=?",
        [state.userId, `mock-reference-live:${state.userId}`],
      );
      if (own[0]?.n === 1) {
        // Repair only this disposable session so interrupted setup or expiry does
        // not prevent the application's own R2/account cleanup from completing.
        const now = Date.now();
        await query("DELETE FROM sessions WHERE user_id=? AND token_hash=?", [
          state.userId,
          await hash(state.sessionToken),
        ]);
        await query(
          "INSERT INTO sessions(id,user_id,token_hash,csrf,created_at,expires_at) SELECT ?,u.id,?,?,?,? FROM users u WHERE u.id=? AND u.is_test=1 AND u.openrouter_user_id=?",
          [
            crypto.randomUUID(),
            await hash(state.sessionToken),
            state.csrf,
            now,
            now + 3600000,
            state.userId,
            `mock-reference-live:${state.userId}`,
          ],
        );
        const cleanup = await fetch(`${origin}/api/v1/account`, {
          method: "DELETE",
          headers: {
            Origin: origin,
            Cookie: `__Host-ps_session=${state.sessionToken}`,
            "X-CSRF-Token": state.csrf,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ confirm: "DELETE" }),
          redirect: "manual",
          signal: AbortSignal.timeout(60000),
        });
        if (!cleanup.ok)
          throw new SmokeFailure(
            "Synthetic live probe cleanup incomplete; run cleanup before release.",
          );
      }
      const remaining = await query<{ n: number }>(
        "SELECT count(*) n FROM users WHERE id=?",
        [state.userId],
      );
      if (remaining[0]?.n)
        throw new SmokeFailure(
          "Synthetic live probe account remains; do not claim cleanup.",
        );
      await query(
        "DELETE FROM auth_lifecycle_events WHERE subject_hash=? AND is_test=1",
        [await hash(`${backup.key}:auth-subject:v1:${state.userId}`)],
      );
      await unlink(statePath);
      console.info(
        "PASS: removed only the synthetic reference probe account and private media.",
      );
    }
  } catch (error) {
    failure ??= error;
  }
  const preserved = await verifyAuth(query, backup.key, baseline);
  console.info(
    `Auth preservation: ${preserved.unchanged} unchanged existing accounts; ${preserved.explicitChanges} explicit lifecycle changes. No credentials or hashes logged.`,
  );
  if (failure) throw failure;
  if (action === "run" && !passed)
    throw new SmokeFailure("Live retrieval was not verified.");
}

await main().catch((error: unknown) => {
  console.error(
    error instanceof SmokeFailure
      ? error.message
      : "Live reference probe could not complete safely; inspect credentials/network and run cleanup if interrupted state remains.",
  );
  process.exitCode = 1;
});
