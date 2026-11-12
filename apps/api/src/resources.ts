import { Hono } from "hono";
import {
  and,
  assets,
  createDb,
  desc,
  eq,
  presets,
  products,
} from "@photo-studio/db";
import {
  type AssetDto,
  type ProductDto,
  type ProductSummaryDto,
  presetInputSchema,
  productAnalysisSchema,
} from "@photo-studio/schemas";
import { z } from "zod";
import { rateLimit } from "./auth";
import type { AppContext, Env } from "./env";
import { AppError, notFound } from "./errors";
import { normalizeImage } from "./images";
import {
  clearObjectQueue,
  deleteObject,
  deleteObjects,
  queueObject,
} from "./storage";

export const assetDto = (row: typeof assets.$inferSelect): AssetDto => ({
  id: row.id,
  productId: row.productId,
  kind: row.kind,
  mimeType: row.mimeType,
  sizeBytes: row.sizeBytes,
  width: row.width,
  height: row.height,
  createdAt: row.createdAt,
  sourcePinUrl: row.sourcePinUrl,
});
export async function ownedProduct(
  env: Env,
  userId: string,
  id: string,
  deleting = false,
) {
  const row = await createDb(env.DB)
    .select()
    .from(products)
    .where(and(eq(products.id, id), eq(products.userId, userId)))
    .get();
  if (!row) throw notFound();
  if (!deleting && row.status !== "ready")
    throw new AppError(
      row.status === "deleting" ? "PRODUCT_DELETING" : "PRODUCT_NOT_READY",
      row.status === "deleting"
        ? "삭제 중인 상품입니다."
        : "사진 저장이 끝난 뒤 다시 실행해 주세요.",
      409,
    );
  return row;
}
export async function productDto(
  env: Env,
  row: typeof products.$inferSelect,
): Promise<ProductDto> {
  const images = await createDb(env.DB)
    .select()
    .from(assets)
    .where(and(eq(assets.productId, row.id), eq(assets.userId, row.userId)))
    .orderBy(assets.createdAt, assets.id)
    .all();
  return productWithImages(row, images);
}
function productWithImages(
  row: typeof products.$inferSelect,
  images: (typeof assets.$inferSelect)[],
): ProductDto {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    analysis: row.analysisJson
      ? productAnalysisSchema.parse(JSON.parse(row.analysisJson))
      : null,
    createdAt: row.createdAt,
    assets: images.map(assetDto),
  };
}
async function productDtos(
  env: Env,
  list: Pick<
    typeof products.$inferSelect,
    "id" | "userId" | "name" | "status" | "createdAt"
  >[],
): Promise<ProductSummaryDto[]> {
  const first = list[0];
  if (!first) return [];
  // One owner-scoped read, rather than one D1 query per sidebar entry.
  const rows = await createDb(env.DB)
    .select()
    .from(assets)
    .where(and(eq(assets.userId, first.userId), eq(assets.kind, "input")))
    .orderBy(assets.createdAt, assets.id)
    .all();
  const images = new Map<string, typeof assets.$inferSelect>();
  for (const row of rows) {
    if (!images.has(row.productId)) images.set(row.productId, row);
  }
  return list.map((p) => {
    const thumbnail = images.get(p.id);
    return {
      id: p.id,
      name: p.name,
      status: p.status,
      createdAt: p.createdAt,
      thumbnail: thumbnail ? assetDto(thumbnail) : null,
    };
  });
}
export interface ResourceDeps {
  normalize?: typeof normalizeImage;
  beforeDelete?: (
    env: Env,
    userId: string,
    productIds: string[],
  ) => Promise<void>;
}
export function resourceRoutes(deps: ResourceDeps = {}) {
  const api = new Hono<AppContext>();
  api.get("/products", async (c) => {
    const rows = await createDb(c.env.DB)
      .select({
        id: products.id,
        userId: products.userId,
        name: products.name,
        status: products.status,
        createdAt: products.createdAt,
      })
      .from(products)
      .where(eq(products.userId, c.get("identity").userId))
      .orderBy(desc(products.createdAt))
      .limit(200)
      .all();
    return c.json({ data: await productDtos(c.env, rows) });
  });
  // Project endpoints are retired rather than creating hidden containers.
  api.all("/projects", () => {
    throw new AppError(
      "FEATURE_RETIRED",
      "프로젝트가 상품 중심 작업으로 통합됐습니다.",
      410,
    );
  });
  api.all("/projects/*", () => {
    throw new AppError("FEATURE_RETIRED", "상품 화면에서 계속해 주세요.", 410);
  });
  async function removeProducts(env: Env, userId: string, ids: string[]) {
    await deps.beforeDelete?.(env, userId, ids);
    const owned = new Set(ids),
      rows = await createDb(env.DB)
        .select({ productId: assets.productId, key: assets.r2Key })
        .from(assets)
        .where(eq(assets.userId, userId))
        .all();
    const pending = await env.DB.prepare(
      "SELECT key FROM storage_cleanup WHERE key LIKE ?",
    )
      .bind(`${userId}/%`)
      .all<{ key: string }>();
    await deleteObjects(env, [
      ...rows.filter((a) => owned.has(a.productId)).map((a) => a.key),
      ...pending.results
        .filter((a) => owned.has(a.key.split("/")[1] ?? ""))
        .map((a) => a.key),
    ]);
  }
  async function upload(
    env: Env,
    userId: string,
    productId: string,
    files: {
      file: File;
      kind: "input" | "person_reference" | "look_reference";
    }[],
  ) {
    const uploaded: string[] = [];
    const inserted: string[] = [];
    const latest = await env.DB.prepare(
      "SELECT coalesce(max(created_at),0) latest FROM assets WHERE product_id=? AND user_id=?",
    )
      .bind(productId, userId)
      .first<{ latest: number }>();
    let lastCreatedAt = latest?.latest ?? 0;
    try {
      for (const { file, kind } of files) {
        const image = await (deps.normalize ?? normalizeImage)(
          new Uint8Array(await file.arrayBuffer()),
          file.type,
        );
        const id = crypto.randomUUID(),
          r2Key = `${userId}/${productId}/${id}.png`;
        const createdAt = Math.max(Date.now(), lastCreatedAt + 1);
        lastCreatedAt = createdAt;
        uploaded.push(r2Key);
        await queueObject(env, r2Key);
        await env.ASSETS.put(r2Key, image.bytes, {
          httpMetadata: { contentType: image.mimeType },
        });
        const result = await env.DB.prepare(
          "INSERT INTO assets (id,user_id,product_id,kind,r2_key,mime_type,size_bytes,width,height,created_at) SELECT ?,?,p.id,?,?,?,?,?,?,? FROM products p WHERE p.id=? AND p.user_id=? AND p.status!='deleting' AND EXISTS (SELECT 1 FROM users u WHERE u.id=p.user_id AND u.status='active') AND NOT EXISTS (SELECT 1 FROM generation_jobs j WHERE j.product_id=p.id AND j.user_id=p.user_id AND j.status IN ('queued','running')) AND (SELECT count(*) FROM assets WHERE product_id=p.id AND kind=?)<?",
        )
          .bind(
            id,
            userId,
            kind,
            r2Key,
            image.mimeType,
            image.bytes.length,
            image.width,
            image.height,
            createdAt,
            productId,
            userId,
            kind,
            kind === "input" ? 3 : 1,
          )
          .run();
        if (!result.meta.changes)
          throw new AppError(
            "UPLOAD_CONFLICT",
            "상품이 삭제 중이거나 사진 3장이 이미 등록돼 있습니다.",
            409,
          );
        inserted.push(id);
        await clearObjectQueue(env, r2Key);
      }
    } catch (e) {
      let cleanupFailed = false;
      for (const key of uploaded) {
        try {
          await deleteObject(env, key);
        } catch {
          cleanupFailed = true;
        }
      }
      if (cleanupFailed)
        throw new AppError(
          "STORAGE_CLEANUP_PENDING",
          "업로드를 완료하지 못했습니다. 정리 작업이 예약됐습니다. 상품을 삭제한 뒤 다시 등록해 주세요.",
          503,
        );
      for (const id of inserted)
        await createDb(env.DB)
          .delete(assets)
          .where(and(eq(assets.id, id), eq(assets.userId, userId)));
      throw e;
    }
  }
  function filesFrom(form: FormData) {
    const files = form.getAll("images");
    if (
      !files.length ||
      files.length > 3 ||
      files.some(
        (file) =>
          !(file instanceof File) ||
          file.size <= 0 ||
          file.size > 10 * 1024 * 1024,
      )
    )
      throw new AppError(
        "INVALID_IMAGE",
        "사진은 최대 3장, 한 장당 10MB까지 선택할 수 있습니다.",
      );
    return files as File[];
  }
  api.post("/products", async (c) => {
    const owner = c.get("identity").userId;
    await rateLimit(c, `upload:${owner}`, 15);
    const form = await c.req.formData(),
      garmentFiles = filesFrom(form);
    const suppliedName = z
      .string()
      .trim()
      .max(120)
      .parse(form.get("name") ?? "");
    const name = suppliedName || "새 상품";
    const files: {
      file: File;
      kind: "input" | "person_reference" | "look_reference";
    }[] = garmentFiles.map((file) => ({ file, kind: "input" }));
    for (const [field, kind] of [
      ["personImage", "person_reference"],
      ["lookImage", "look_reference"],
    ] as const) {
      const file = form.get(field);
      if (file === null || file === "") continue;
      if (form.get("rightsConfirmed") !== "true")
        throw new AppError(
          "REFERENCE_CONSENT_REQUIRED",
          "참조 사진의 사용 권한과 인물 동의를 확인해 주세요.",
        );
      if (
        !(file instanceof File) ||
        file.size <= 0 ||
        file.size > 10 * 1024 * 1024
      )
        throw new AppError(
          "INVALID_IMAGE",
          "참조 사진은 한 장당 10MB까지 선택해 주세요.",
        );
      files.push({ file, kind });
    }
    const row = {
      id: crypto.randomUUID(),
      userId: owner,
      name,
      nameSource: suppliedName ? "manual" : "auto",
      status: "uploading",
      analysisJson: null,
      analysisVersion: null,
      createdAt: Date.now(),
    };
    const inserted = await c.env.DB.prepare(
      "INSERT INTO products(id,user_id,name,name_source,status,created_at) SELECT ?,id,?,?,'uploading',? FROM users WHERE id=? AND status='active' AND (SELECT count(*) FROM products WHERE user_id=?)<200",
    )
      .bind(row.id, name, row.nameSource, row.createdAt, owner, owner)
      .run();
    if (!inserted.meta.changes)
      throw new AppError(
        "PRODUCT_LIMIT_OR_ACCOUNT_DELETING",
        "계정이 삭제 중이거나 상품 200개가 등록돼 있습니다.",
        409,
      );
    try {
      await upload(c.env, owner, row.id, files);
    } catch (e) {
      if (e instanceof AppError && e.code === "STORAGE_CLEANUP_PENDING")
        await createDb(c.env.DB)
          .update(products)
          .set({ status: "deleting" })
          .where(and(eq(products.id, row.id), eq(products.userId, owner)));
      else
        await createDb(c.env.DB)
          .delete(products)
          .where(and(eq(products.id, row.id), eq(products.userId, owner)));
      throw e;
    }
    const completed = await createDb(c.env.DB)
      .update(products)
      .set({ status: "ready" })
      .where(
        and(
          eq(products.id, row.id),
          eq(products.userId, owner),
          eq(products.status, "uploading"),
        ),
      )
      .returning()
      .get();
    if (!completed)
      throw new AppError(
        "UPLOAD_CONFLICT",
        "사진을 저장하는 동안 상품이 삭제됐습니다.",
        409,
      );
    return c.json({ data: await productDto(c.env, completed) }, 201);
  });
  api.patch("/products/:id", async (c) => {
    const owner = c.get("identity").userId,
      product = await ownedProduct(c.env, owner, c.req.param("id"));
    const { name } = z
      .object({ name: z.string().trim().min(1).max(120) })
      .strict()
      .parse(await c.req.json());
    await createDb(c.env.DB)
      .update(products)
      .set({ name, nameSource: "manual" })
      .where(and(eq(products.id, product.id), eq(products.userId, owner)));
    return c.json({ data: await productDto(c.env, { ...product, name }) });
  });
  api.post("/products/:id/assets", async (c) => {
    const owner = c.get("identity").userId;
    const product = await ownedProduct(c.env, owner, c.req.param("id"));
    const files = filesFrom(await c.req.formData());
    const lock = await c.env.DB.prepare(
      "UPDATE products SET status='uploading' WHERE id=? AND user_id=? AND status='ready' AND NOT EXISTS(SELECT 1 FROM generation_jobs WHERE product_id=? AND user_id=? AND status IN ('queued','running'))",
    )
      .bind(product.id, owner, product.id, owner)
      .run();
    if (!lock.meta.changes)
      throw new AppError(
        "JOB_ACTIVE",
        "작업 완료 후 원본을 추가해 주세요.",
        409,
      );
    let restore = true;
    try {
      await upload(
        c.env,
        owner,
        product.id,
        files.map((file) => ({ file, kind: "input" as const })),
      );
    } catch (error) {
      if (error instanceof AppError && error.code === "STORAGE_CLEANUP_PENDING")
        restore = false;
      throw error;
    } finally {
      if (restore)
        await c.env.DB.prepare(
          "UPDATE products SET status='ready' WHERE id=? AND user_id=? AND status='uploading'",
        )
          .bind(product.id, owner)
          .run();
    }
    return c.json({ data: await productDto(c.env, product) }, 201);
  });
  api.get("/products/:id", async (c) =>
    c.json({
      data: await productDto(
        c.env,
        await ownedProduct(
          c.env,
          c.get("identity").userId,
          c.req.param("id"),
          true,
        ),
      ),
    }),
  );
  api.delete("/products/:id", async (c) => {
    const owner = c.get("identity").userId,
      product = await ownedProduct(c.env, owner, c.req.param("id"), true);
    await createDb(c.env.DB)
      .update(products)
      .set({ status: "deleting" })
      .where(and(eq(products.id, product.id), eq(products.userId, owner)));
    await removeProducts(c.env, owner, [product.id]);
    await createDb(c.env.DB)
      .delete(products)
      .where(and(eq(products.id, product.id), eq(products.userId, owner)));
    return c.json({ data: { deleted: true } });
  });
  api.get("/products/:id/assets", async (c) => {
    const product = await ownedProduct(
      c.env,
      c.get("identity").userId,
      c.req.param("id"),
    );
    return c.json({ data: (await productDto(c.env, product)).assets });
  });
  async function assetOwned(env: Env, owner: string, id: string) {
    const asset = await createDb(env.DB)
      .select()
      .from(assets)
      .where(and(eq(assets.id, id), eq(assets.userId, owner)))
      .get();
    if (!asset) throw notFound();
    await ownedProduct(env, owner, asset.productId);
    return asset;
  }
  for (const type of ["content", "download"] as const)
    api.get(`/assets/:id/${type}`, async (c) => {
      const asset = await assetOwned(
        c.env,
        c.get("identity").userId,
        c.req.param("id"),
      );
      const object = await c.env.ASSETS.get(asset.r2Key);
      if (!object) throw notFound();
      return new Response(object.body, {
        headers: {
          "Content-Type": asset.mimeType,
          "Cache-Control": "private, no-store",
          "Content-Disposition": `${type === "download" ? "attachment" : "inline"}; filename="photo-studio.png"`,
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'; sandbox",
        },
      });
    });
  api.delete("/assets/:id", async (c) => {
    const owner = c.get("identity").userId,
      asset = await assetOwned(c.env, owner, c.req.param("id"));
    if (asset.kind === "input")
      await (
        await import("./pipeline")
      ).immutableSources(c.env, owner, asset.productId);
    if (asset.kind === "person_reference" || asset.kind === "look_reference") {
      await (
        await import("./pipeline")
      ).assertIdle(c.env, owner, asset.productId);
      const deleted = await c.env.DB.prepare(
        "DELETE FROM assets WHERE id=? AND user_id=? AND NOT EXISTS(SELECT 1 FROM generation_jobs j WHERE j.product_id=? AND j.user_id=? AND j.status IN ('queued','running'))",
      )
        .bind(asset.id, owner, asset.productId, owner)
        .run();
      if (!deleted.meta.changes)
        throw new AppError(
          "JOB_CONFLICT",
          "작업이 진행 중입니다. 완료된 뒤 참조 사진을 삭제해 주세요.",
          409,
        );
      await deleteObject(c.env, asset.r2Key);
      return c.json({ data: { deleted: true } });
    }
    await deps.beforeDelete?.(c.env, owner, [asset.productId]);
    await deleteObject(c.env, asset.r2Key);
    await createDb(c.env.DB)
      .delete(assets)
      .where(and(eq(assets.id, asset.id), eq(assets.userId, owner)));
    return c.json({ data: { deleted: true } });
  });
  api.get("/presets", async (c) => {
    const rows = await createDb(c.env.DB)
      .select()
      .from(presets)
      .where(eq(presets.userId, c.get("identity").userId))
      .orderBy(desc(presets.updatedAt))
      .all();
    return c.json({
      data: rows.map((row) => ({
        ...presetInputSchema.parse(JSON.parse(row.specJson)),
        id: row.id,
        updatedAt: row.updatedAt,
      })),
    });
  });
  api.post("/presets", async (c) => {
    const input = presetInputSchema.parse(await c.req.json()),
      id = crypto.randomUUID(),
      now = Date.now();
    await createDb(c.env.DB)
      .insert(presets)
      .values({
        id,
        userId: c.get("identity").userId,
        name: input.name,
        specJson: JSON.stringify(input),
        updatedAt: now,
      });
    return c.json({ data: { ...input, id, updatedAt: now } }, 201);
  });
  api.patch("/presets/:id", async (c) => {
    const owner = c.get("identity").userId;
    const row = await createDb(c.env.DB)
      .select()
      .from(presets)
      .where(and(eq(presets.id, c.req.param("id")), eq(presets.userId, owner)))
      .get();
    if (!row) throw notFound();
    const input = presetInputSchema.parse(await c.req.json()),
      now = Date.now();
    await createDb(c.env.DB)
      .update(presets)
      .set({
        name: input.name,
        specJson: JSON.stringify(input),
        updatedAt: now,
      })
      .where(and(eq(presets.id, row.id), eq(presets.userId, owner)));
    return c.json({ data: { ...input, id: row.id, updatedAt: now } });
  });
  api.delete("/presets/:id", async (c) => {
    const owner = c.get("identity").userId;
    const row = await createDb(c.env.DB)
      .select()
      .from(presets)
      .where(and(eq(presets.id, c.req.param("id")), eq(presets.userId, owner)))
      .get();
    if (!row) throw notFound();
    await createDb(c.env.DB)
      .delete(presets)
      .where(and(eq(presets.id, row.id), eq(presets.userId, owner)));
    return c.json({ data: { deleted: true } });
  });
  return api;
}
