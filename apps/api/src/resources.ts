import { Hono } from "hono";
import {
  and,
  assets,
  createDb,
  desc,
  eq,
  presets,
  products,
  projects,
} from "@photo-studio/db";
import {
  type AssetDto,
  type ProductDto,
  type ProjectDto,
  presetInputSchema,
  productAnalysisSchema,
  projectInputSchema,
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

export const projectDto = (row: typeof projects.$inferSelect): ProjectDto => ({
  id: row.id,
  name: row.name,
  description: row.description,
  status: row.status,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});
export const assetDto = (row: typeof assets.$inferSelect): AssetDto => ({
  id: row.id,
  productId: row.productId,
  kind: row.kind,
  mimeType: row.mimeType,
  sizeBytes: row.sizeBytes,
  width: row.width,
  height: row.height,
  createdAt: row.createdAt,
});
export async function ownedProject(
  env: Env,
  userId: string,
  id: string,
  deleting = false,
) {
  const row = await createDb(env.DB)
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .get();
  if (!row) throw notFound();
  if (!deleting && row.status !== "active")
    throw new AppError(
      "PROJECT_DELETING",
      "삭제 중인 프로젝트입니다. 삭제를 다시 시도해 주세요.",
      409,
    );
  return row;
}
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
  await ownedProject(env, userId, row.projectId, deleting);
  if (!deleting && row.status === "deleting")
    throw new AppError("PRODUCT_DELETING", "삭제 중인 상품입니다.", 409);
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
    .orderBy(assets.createdAt)
    .all();
  return productWithImages(row, images);
}
function productWithImages(
  row: typeof products.$inferSelect,
  images: (typeof assets.$inferSelect)[],
): ProductDto {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    status: row.status,
    analysis: row.analysisJson
      ? productAnalysisSchema.parse(JSON.parse(row.analysisJson))
      : null,
    createdAt: row.createdAt,
    assets: images.map(assetDto),
  };
}
async function productDtos(env: Env, list: (typeof products.$inferSelect)[]) {
  const db = createDb(env.DB),
    queries = list.map((p) =>
      db
        .select()
        .from(assets)
        .where(and(eq(assets.productId, p.id), eq(assets.userId, p.userId)))
        .orderBy(assets.createdAt),
    );
  const first = queries[0];
  if (!first) return [];
  const rows = await db.batch([first, ...queries.slice(1)]);
  return list.map((p, i) => productWithImages(p, rows[i] ?? []));
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
  api.get("/projects", async (c) => {
    const rows = await createDb(c.env.DB)
      .select()
      .from(projects)
      .where(eq(projects.userId, c.get("identity").userId))
      .orderBy(desc(projects.updatedAt))
      .limit(200)
      .all();
    return c.json({ data: rows.map(projectDto) });
  });
  api.post("/projects", async (c) => {
    const identity = c.get("identity");
    await rateLimit(c, `project:${identity.userId}`, 20);
    const input = projectInputSchema.parse(await c.req.json());
    const count = await c.env.DB.prepare(
      "SELECT count(*) n FROM projects WHERE user_id=?",
    )
      .bind(identity.userId)
      .first<{ n: number }>();
    if ((count?.n ?? 0) >= 200)
      throw new AppError(
        "LIMIT_REACHED",
        "베타에서는 최대 200개 프로젝트를 보관할 수 있습니다.",
        409,
      );
    const row = {
      id: crypto.randomUUID(),
      userId: identity.userId,
      ...input,
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const inserted = await c.env.DB.prepare(
      "INSERT INTO projects(id,user_id,name,description,status,created_at,updated_at) SELECT ?,id,?,?,'active',?,? FROM users WHERE id=? AND status='active'",
    )
      .bind(
        row.id,
        row.name,
        row.description,
        row.createdAt,
        row.updatedAt,
        identity.userId,
      )
      .run();
    if (!inserted.meta.changes)
      throw new AppError("ACCOUNT_DELETING", "계정 삭제가 진행 중입니다.", 409);
    return c.json({ data: projectDto(row) }, 201);
  });
  api.get("/projects/:id", async (c) => {
    const row = await ownedProject(
      c.env,
      c.get("identity").userId,
      c.req.param("id"),
      true,
    );
    const list = await createDb(c.env.DB)
      .select()
      .from(products)
      .where(
        and(eq(products.projectId, row.id), eq(products.userId, row.userId)),
      )
      .orderBy(desc(products.createdAt))
      .all();
    return c.json({
      data: {
        ...projectDto(row),
        products: await productDtos(c.env, list),
      },
    });
  });
  api.patch("/projects/:id", async (c) => {
    const row = await ownedProject(
      c.env,
      c.get("identity").userId,
      c.req.param("id"),
    );
    const input = projectInputSchema.parse(await c.req.json());
    await createDb(c.env.DB)
      .update(projects)
      .set({ ...input, updatedAt: Date.now() })
      .where(and(eq(projects.id, row.id), eq(projects.userId, row.userId)));
    return c.json({
      data: projectDto({ ...row, ...input, updatedAt: Date.now() }),
    });
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
  api.delete("/projects/:id", async (c) => {
    const row = await ownedProject(
      c.env,
      c.get("identity").userId,
      c.req.param("id"),
      true,
    );
    await createDb(c.env.DB)
      .update(projects)
      .set({ status: "deleting" })
      .where(and(eq(projects.id, row.id), eq(projects.userId, row.userId)));
    const list = await createDb(c.env.DB)
      .select({ id: products.id })
      .from(products)
      .where(
        and(eq(products.projectId, row.id), eq(products.userId, row.userId)),
      )
      .all();
    await removeProducts(
      c.env,
      row.userId,
      list.map((p) => p.id),
    );
    await createDb(c.env.DB)
      .delete(projects)
      .where(and(eq(projects.id, row.id), eq(projects.userId, row.userId)));
    return c.json({ data: { deleted: true } });
  });
  async function upload(
    env: Env,
    userId: string,
    productId: string,
    files: File[],
  ) {
    const uploaded: string[] = [];
    const inserted: string[] = [];
    try {
      for (const file of files) {
        const image = await (deps.normalize ?? normalizeImage)(
          new Uint8Array(await file.arrayBuffer()),
          file.type,
        );
        const id = crypto.randomUUID(),
          r2Key = `${userId}/${productId}/${id}.png`;
        uploaded.push(r2Key);
        await queueObject(env, r2Key);
        await env.ASSETS.put(r2Key, image.bytes, {
          httpMetadata: { contentType: image.mimeType },
        });
        const result = await env.DB.prepare(
          "INSERT INTO assets (id,user_id,product_id,kind,r2_key,mime_type,size_bytes,width,height,created_at) SELECT ?,?,p.id,'input',?,?,?,?,?,? FROM products p JOIN projects pr ON pr.id=p.project_id WHERE p.id=? AND p.user_id=? AND pr.user_id=? AND pr.status='active' AND p.status!='deleting' AND EXISTS (SELECT 1 FROM users u WHERE u.id=p.user_id AND u.status='active') AND NOT EXISTS (SELECT 1 FROM generation_jobs j WHERE j.product_id=p.id AND j.user_id=p.user_id) AND (SELECT count(*) FROM assets WHERE product_id=p.id AND kind='input')<3",
        )
          .bind(
            id,
            userId,
            r2Key,
            image.mimeType,
            image.bytes.length,
            image.width,
            image.height,
            Date.now(),
            productId,
            userId,
            userId,
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
  api.post("/projects/:id/products", async (c) => {
    const owner = c.get("identity").userId;
    await rateLimit(c, `upload:${owner}`, 15);
    const project = await ownedProject(c.env, owner, c.req.param("id"));
    const count = await c.env.DB.prepare(
      "SELECT count(*) n FROM products WHERE project_id=? AND user_id=?",
    )
      .bind(project.id, owner)
      .first<{ n: number }>();
    if ((count?.n ?? 0) >= 100)
      throw new AppError(
        "LIMIT_REACHED",
        "프로젝트에는 최대 100개 상품을 등록할 수 있습니다.",
        409,
      );
    const form = await c.req.formData(),
      files = filesFrom(form);
    const name = z.string().trim().min(1).max(120).parse(form.get("name"));
    const row = {
      id: crypto.randomUUID(),
      userId: owner,
      projectId: project.id,
      name,
      status: "uploading",
      analysisJson: null,
      analysisVersion: null,
      createdAt: Date.now(),
    };
    const inserted = await c.env.DB.prepare(
      "INSERT INTO products(id,user_id,project_id,name,status,created_at) SELECT ?,pr.user_id,pr.id,?,'uploading',? FROM projects pr JOIN users u ON u.id=pr.user_id WHERE pr.id=? AND pr.user_id=? AND pr.status='active' AND u.status='active'",
    )
      .bind(row.id, row.name, row.createdAt, row.projectId, owner)
      .run();
    if (!inserted.meta.changes)
      throw new AppError(
        "PROJECT_DELETING",
        "프로젝트나 계정의 삭제가 진행 중입니다.",
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
    await createDb(c.env.DB)
      .update(products)
      .set({ status: "ready" })
      .where(and(eq(products.id, row.id), eq(products.userId, owner)));
    await createDb(c.env.DB)
      .update(projects)
      .set({ updatedAt: Date.now() })
      .where(and(eq(projects.id, project.id), eq(projects.userId, owner)));
    return c.json(
      { data: await productDto(c.env, { ...row, status: "ready" }) },
      201,
    );
  });
  api.post("/products/:id/assets", async (c) => {
    const owner = c.get("identity").userId;
    const product = await ownedProduct(c.env, owner, c.req.param("id"));
    await (
      await import("./pipeline")
    ).immutableSources(c.env, owner, product.id);
    await upload(c.env, owner, product.id, filesFrom(await c.req.formData()));
    return c.json({ data: await productDto(c.env, product) }, 201);
  });
  api.get("/products/:id", async (c) =>
    c.json({
      data: await productDto(
        c.env,
        await ownedProduct(c.env, c.get("identity").userId, c.req.param("id")),
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
