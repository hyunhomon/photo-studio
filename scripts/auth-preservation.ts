// Auth state stays in memory. Never print or persist credentials, row IDs or these hashes.
export type AuthQuery = <T>(sql: string, params?: unknown[]) => Promise<T[]>;
interface State {
  profile: string;
  connections: string;
  sessions: string;
  connectionCount: number;
  sessionCount: number;
}
export interface AuthBaseline {
  at: number;
  state: Map<string, State>;
}
async function digest(value: unknown) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return [...new Uint8Array(bytes)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
async function subject(key: string, id: string) {
  // Same domain separation as the Worker. Fingerprints never leave this process.
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${key}:auth-subject:v1:${id}`),
  );
  return [...new Uint8Array(bytes)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
export async function captureAuth(
  query: AuthQuery,
  key: string,
  testUserId?: string,
): Promise<AuthBaseline> {
  const at = Date.now();
  const present = await query<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='users'",
  );
  if (!present.length) return { at, state: new Map() };
  const filter = testUserId ? "u.id=? AND u.is_test=1" : "u.is_test=0";
  const params = testUserId ? [testUserId] : [];
  // One SQLite statement gives a coherent snapshot even when a human signs out concurrently.
  const accounts = await query<{
    id: string;
    profile: string;
    connections: string;
    sessions: string;
  }>(
    `SELECT u.id,json_object('id',u.id,'external',u.openrouter_user_id,'status',u.status,'created',u.created_at) profile,(SELECT json_group_array(json_object('id',id,'provider',provider,'envelope',key_envelope,'linked',linked_at,'revoked',revoked_at)) FROM (SELECT * FROM provider_connections WHERE user_id=u.id ORDER BY id)) connections,(SELECT json_group_array(json_object('id',id,'token',token_hash,'csrf',csrf,'expires',expires_at,'created',created_at)) FROM (SELECT * FROM sessions WHERE user_id=u.id ORDER BY id)) sessions FROM users u WHERE ${filter} ORDER BY u.id`,
    params,
  );
  const state = new Map<string, State>();
  for (const account of accounts) {
    state.set(await subject(key, account.id), {
      profile: await digest(account.profile),
      connections: await digest(account.connections),
      sessions: await digest(account.sessions),
      connectionCount: JSON.parse(account.connections).length,
      sessionCount: JSON.parse(account.sessions).length,
    });
  }
  return { at, state };
}
export async function verifyAuth(
  query: AuthQuery,
  key: string,
  before: AuthBaseline,
  testUserId?: string,
) {
  const after = await captureAuth(query, key, testUserId);
  const auditPresent = await query<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='auth_lifecycle_events'",
  );
  const events =
    auditPresent.length && !testUserId
      ? await query<{ subject_hash: string; event: string }>(
          "SELECT subject_hash,event FROM auth_lifecycle_events WHERE is_test=0 AND created_at>=?",
          [before.at],
        )
      : [];
  let unchanged = 0,
    explicitChanges = 0;
  for (const [id, previous] of before.state) {
    const current = after.state.get(id);
    if (current && JSON.stringify(current) === JSON.stringify(previous)) {
      unchanged++;
      continue;
    }
    const kinds = new Set(
      events.filter((e) => e.subject_hash === id).map((e) => e.event),
    );
    const disconnected =
      kinds.has("credentials_disconnected") &&
      current?.connectionCount === 0 &&
      current.sessionCount === 0;
    const deleted = kinds.has("account_deleted") && !current;
    const explained =
      deleted ||
      (current &&
        current.profile === previous.profile &&
        (current.connections === previous.connections ||
          kinds.has("provider_connected") ||
          disconnected) &&
        (current.sessions === previous.sessions ||
          disconnected ||
          ["session_issued", "session_refreshed", "session_expired"].some(
            (kind) => kinds.has(kind),
          )));
    if (!explained)
      throw new Error(
        testUserId
          ? "Synthetic auth sentinel changed during deployment/test; release verification failed."
          : "Existing account auth changed without a matching lifecycle event; investigate before claiming preservation.",
      );
    explicitChanges++;
  }
  return { unchanged, explicitChanges };
}
