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
export async function deleteObjects(env: Env, keys: string[]) {
  const unique = [...new Set(keys)];
  if (!unique.length) return;
  await env.DB.batch(
    unique.map((key) =>
      env.DB.prepare(
        "INSERT INTO storage_cleanup(key,expires_at) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET expires_at=excluded.expires_at",
      ).bind(key, Date.now() + 600000),
    ),
  );
  for (let i = 0; i < unique.length; i += 1000)
    await env.ASSETS.delete(unique.slice(i, i + 1000));
  // Retain deletion intents through the next GC to catch writes already in flight.
}
export async function cleanupStorage(env: Env) {
  const purges = await env.DB.prepare(
    "SELECT user_id,created_at FROM media_purges ORDER BY checked_at LIMIT 10",
  ).all<{ user_id: string; created_at: number }>();
  const checked: D1PreparedStatement[] = [];
  for (const purge of purges.results) {
    try {
      await purgeUserMedia(env, purge.user_id, 2);
      checked.push(
        env.DB.prepare(
          "DELETE FROM users WHERE id=? AND status='deleting'",
        ).bind(purge.user_id),
      );
      if (Date.now() - purge.created_at > 86400000)
        checked.push(
          env.DB.prepare("DELETE FROM media_purges WHERE user_id=?").bind(
            purge.user_id,
          ),
        );
    } catch {
      /* Retain prefix tombstone until all late writes are removed. */
    }
    checked.push(
      env.DB.prepare(
        "UPDATE media_purges SET checked_at=? WHERE user_id=?",
      ).bind(Date.now(), purge.user_id),
    );
  }
  if (checked.length) await env.DB.batch(checked);
  const pending = await env.DB.prepare(
    "SELECT key FROM storage_cleanup WHERE expires_at<? LIMIT 100",
  )
    .bind(Date.now())
    .all<{ key: string }>();
  if (!pending.results.length) return;
  try {
    const validity = await env.DB.batch<{ n: number }>(
      pending.results.map((row) =>
        env.DB.prepare(
          "SELECT 1 AS n FROM assets a JOIN products p ON p.id=a.product_id JOIN projects pr ON pr.id=p.project_id WHERE a.r2_key=? AND p.status='ready' AND pr.status='active'",
        ).bind(row.key),
      ),
    );
    const orphan = pending.results
      .filter((_row, i) => !validity[i]?.results.length)
      .map((row) => row.key);
    if (orphan.length) await env.ASSETS.delete(orphan);
    await env.DB.batch(
      pending.results.map((row) =>
        env.DB.prepare("DELETE FROM storage_cleanup WHERE key=?").bind(row.key),
      ),
    );
  } catch {
    /* Keep deletion intents for the next scheduled cleanup. */
  }
}
export async function purgeUserMedia(
  env: Env,
  userId: string,
  maxPages = Number.POSITIVE_INFINITY,
) {
  if (!/^[a-f\d-]{36}$/i.test(userId)) throw new Error("Invalid purge scope");
  const prefix = `${userId}/`;
  let cursor: string | undefined;
  let pages = 0;
  do {
    const page = await env.ASSETS.list({ prefix, cursor, limit: 1000 });
    const keys = page.objects.map((o) => o.key);
    if (keys.some((k) => !k.startsWith(prefix)))
      throw new Error("Invalid purge scope");
    if (keys.length) await env.ASSETS.delete(keys);
    cursor = page.truncated ? page.cursor : undefined;
    if (cursor && ++pages >= maxPages)
      throw new Error("Purge continuation required");
  } while (cursor);
}
