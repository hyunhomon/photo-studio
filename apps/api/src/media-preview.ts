import type { Env } from "./env";
import { preparePreviewSet, type PreparedPreview } from "./images";
import { previewSuffix } from "./preview-policy";
import { deleteObject } from "./storage";
import { notFound } from "./errors";
export interface PreviewAsset {
  id: string;
  userId: string;
  productId: string;
  r2Key: string;
  mimeType: string;
  kind: string;
}
const pending = new Map<string, Promise<PreparedPreview[]>>();
const ownerSql =
  "SELECT 1 FROM assets a JOIN products p ON p.id=a.product_id AND p.user_id=a.user_id JOIN users u ON u.id=a.user_id WHERE a.id=? AND a.user_id=? AND p.status='ready' AND u.status='active'";
export async function storePreviews(
  env: Env,
  asset: PreviewAsset,
  previews: PreparedPreview[],
) {
  const keys = previews.map((p) => asset.r2Key + previewSuffix(p.size));
  await env.DB.batch(
    keys.map((key) =>
      env.DB.prepare(
        "INSERT INTO storage_cleanup(key,expires_at) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET expires_at=excluded.expires_at",
      ).bind(key, Date.now() + 600000),
    ),
  );
  try {
    const writes = await Promise.allSettled(
      previews.map((p) =>
        env.ASSETS.put(asset.r2Key + previewSuffix(p.size), p.bytes, {
          httpMetadata: { contentType: p.mimeType },
        }),
      ),
    );
    const failure = writes.find((r) => r.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
    // Never clear an asset deletion's intent after logical removal.
    await env.DB.batch(
      keys.map((key) =>
        env.DB.prepare(
          `DELETE FROM storage_cleanup WHERE key=? AND EXISTS(${ownerSql})`,
        ).bind(key, asset.id, asset.userId),
      ),
    );
    if (!(await env.DB.prepare(ownerSql).bind(asset.id, asset.userId).first()))
      throw notFound();
  } catch (error) {
    await Promise.allSettled(keys.map((key) => deleteObject(env, key)));
    throw error;
  }
}
export async function ensurePreviews(env: Env, asset: PreviewAsset) {
  let work = pending.get(asset.id);
  if (!work) {
    work = (async () => {
      const object = await env.ASSETS.get(asset.r2Key);
      if (!object) throw notFound();
      const previews = await preparePreviewSet(
        new Uint8Array(await object.arrayBuffer()),
        asset.mimeType,
        asset.kind === "generated",
      );
      await storePreviews(env, asset, previews);
      return previews;
    })();
    pending.set(asset.id, work);
    void work
      .finally(() => {
        if (pending.get(asset.id) === work) pending.delete(asset.id);
      })
      .catch(() => {});
  }
  return work;
}
