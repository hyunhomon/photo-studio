import type { Env } from "./env";
import { hash } from "./crypto";
import { AppError } from "./errors";

export type AuthLifecycleEvent =
  | "session_issued"
  | "session_refreshed"
  | "session_expired"
  | "provider_connected"
  | "credentials_disconnected"
  | "account_deleted";

export function authSubjectHash(env: Env, userId: string) {
  if (!env.APP_ENCRYPTION_KEY_B64)
    throw new AppError(
      "SERVER_CONFIGURATION",
      "보안 설정을 확인해 주세요.",
      503,
    );
  return hash(`${env.APP_ENCRYPTION_KEY_B64}:auth-subject:v1:${userId}`);
}

/** Execute in the same batch as the mutation, so an event never claims a rolled-back removal. */
export async function authAuditStatement(
  env: Env,
  userId: string,
  event: AuthLifecycleEvent,
  reason:
    | "sign_in"
    | "explicit_refresh"
    | "oauth_callback"
    | "explicit_logout"
    | "explicit_disconnect"
    | "scheduled_expiry"
    | "deletion_retry_cleanup"
    | "explicit_account_deletion",
  options: {
    sessions?: number;
    connections?: number;
    captureExisting?: boolean;
    expiredBefore?: number;
    at?: number;
  } = {},
) {
  return env.DB.prepare(
    "INSERT INTO auth_lifecycle_events(id,subject_hash,event,reason,is_test,connections_affected,sessions_affected,created_at) SELECT ?,?,?,?,is_test,CASE WHEN ? THEN (SELECT count(*) FROM provider_connections WHERE user_id=users.id) ELSE ? END,CASE WHEN ? THEN (SELECT count(*) FROM sessions WHERE user_id=users.id AND (? IS NULL OR expires_at<?)) ELSE ? END,? FROM users WHERE id=? AND (?=0 OR status='deleting')",
  ).bind(
    crypto.randomUUID(),
    await authSubjectHash(env, userId),
    event,
    reason,
    options.captureExisting ? 1 : 0,
    options.connections ?? 0,
    options.captureExisting || options.expiredBefore !== undefined ? 1 : 0,
    options.expiredBefore ?? null,
    options.expiredBefore ?? null,
    options.sessions ?? 0,
    options.at ?? Date.now(),
    userId,
    event === "account_deleted" ? 1 : 0,
  );
}
