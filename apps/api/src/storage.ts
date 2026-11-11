import type { Env } from "./env";
export async function queueObject(env: Env, key: string) {
  await env.DB.prepare(
    "INSERT INTO storage_cleanup (key,expires_at) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET expires_at=excluded.expires_at",
  )
    .bind(key, Date.now() + 600000)
    .run();
}
export async function clearObjectQueue(env: Env, key: string) {
  await env.DB.prepare("DELETE FROM storage_cleanup WHERE key=?")
    .bind(key)
    .run();
}
export async function deleteObject(env: Env, key: string) {
  await queueObject(env, key);
  await env.ASSETS.delete(key);
  await clearObjectQueue(env, key);
}
export async function cleanupStorage(env: Env) {
  const pending = await env.DB.prepare(
    "SELECT key FROM storage_cleanup WHERE expires_at<? LIMIT 100",
  )
    .bind(Date.now())
    .all<{ key: string }>();
  for (const row of pending.results) {
    try {
      const valid = await env.DB.prepare(
        "SELECT 1 AS n FROM assets a JOIN products p ON p.id=a.product_id JOIN projects pr ON pr.id=p.project_id WHERE a.r2_key=? AND p.status='ready' AND pr.status='active'",
      )
        .bind(row.key)
        .first();
      if (!valid) await env.ASSETS.delete(row.key);
      await clearObjectQueue(env, row.key);
    } catch {
      /* Keep the tombstone for the next scheduled cleanup. */
    }
  }
}
