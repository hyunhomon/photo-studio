import { Hono } from "hono";
import { and, assets, createDb, eq } from "@photo-studio/db";
import { referenceRoleSchema } from "@photo-studio/schemas";
import type { AppContext } from "./env";
import { AppError } from "./errors";
import { ownedProduct, productDto } from "./resources";
import { normalizeImage } from "./images";
import { rateLimit } from "./auth";
import { assertIdle } from "./pipeline";
import { clearObjectQueue, deleteObject, queueObject } from "./storage";
import { canonicalPinUrl } from "./reference-source";

export function referenceRoutes(
  deps: { normalize?: typeof normalizeImage } = {},
) {
  const api = new Hono<AppContext>();
  api.post("/products/:id/references", async (c) => {
    const owner = c.get("identity").userId;
    const product = await ownedProduct(c.env, owner, c.req.param("id"));
    await rateLimit(c, `reference-upload:${owner}`, 15);
    await assertIdle(c.env, owner, product.id);
    const form = await c.req.formData();
    const role = referenceRoleSchema.parse(form.get("role"));
    const sourcePinUrl = canonicalPinUrl(form.get("sourcePinUrl"));
    if (sourcePinUrl && role !== "look_reference")
      throw new AppError(
        "INVALID_REFERENCE_SOURCE",
        "Pinterest 출처는 촬영감 참조에만 연결할 수 있습니다.",
      );
    if (form.get("rightsConfirmed") !== "true")
      throw new AppError(
        "REFERENCE_CONSENT_REQUIRED",
        "사진의 사용 권한과 인물 동의를 먼저 확인해 주세요.",
      );
    const file = form.get("image");
    if (
      !(file instanceof File) ||
      file.size <= 0 ||
      file.size > 10 * 1024 * 1024
    )
      throw new AppError(
        "INVALID_IMAGE",
        "참조 사진은 한 장, 10MB까지 선택해 주세요.",
      );
    const image = await (deps.normalize ?? normalizeImage)(
      new Uint8Array(await file.arrayBuffer()),
      file.type,
    );
    const id = crypto.randomUUID(),
      key = `${owner}/${product.id}/${id}.png`;
    await queueObject(c.env, key);
    try {
      await c.env.ASSETS.put(key, image.bytes, {
        httpMetadata: { contentType: image.mimeType },
      });
      // This atomic statement guards concurrent uploads, new jobs and deletion.
      const saved = await c.env.DB.prepare(
        "INSERT INTO assets(id,user_id,product_id,kind,r2_key,mime_type,size_bytes,width,height,created_at,source_pin_url) SELECT ?,p.user_id,p.id,?,?,?,?,?,?,?,? FROM products p JOIN users u ON u.id=p.user_id WHERE p.id=? AND p.user_id=? AND p.status='ready' AND u.status='active' AND NOT EXISTS(SELECT 1 FROM assets a WHERE a.product_id=p.id AND a.user_id=p.user_id AND a.kind=?) AND NOT EXISTS(SELECT 1 FROM generation_jobs j WHERE j.product_id=p.id AND j.user_id=p.user_id AND j.status IN ('queued','running'))",
      )
        .bind(
          id,
          role,
          key,
          image.mimeType,
          image.bytes.length,
          image.width,
          image.height,
          Date.now(),
          sourcePinUrl,
          product.id,
          owner,
          role,
        )
        .run();
      if (!saved.meta.changes)
        throw new AppError(
          "REFERENCE_CONFLICT",
          "같은 용도의 사진이 있거나 작업이 진행 중입니다. 기존 사진을 삭제한 뒤 다시 등록해 주세요.",
          409,
        );
      await clearObjectQueue(c.env, key);
    } catch (error) {
      try {
        await deleteObject(c.env, key);
      } catch {
        throw new AppError(
          "STORAGE_CLEANUP_PENDING",
          "참조 사진 저장을 마치지 못해 정리를 예약했습니다. 잠시 후 다시 확인해 주세요.",
          503,
        );
      }
      await createDb(c.env.DB)
        .delete(assets)
        .where(and(eq(assets.id, id), eq(assets.userId, owner)));
      throw error;
    }
    return c.json({ data: await productDto(c.env, product) }, 201);
  });
  return api;
}
