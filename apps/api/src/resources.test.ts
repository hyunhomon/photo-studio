import { describe, expect, test, spyOn } from "bun:test";
import { createApp } from "./app";
import { normalizeImage } from "./images";
import { inspectImage } from "./image-meta";
import { cleanupStorage } from "./storage";
import { memoryEnv } from "../test/memory";
import { syntheticPng } from "../test/png";
import encodeJpeg, { init as initJpegEncode } from "@jsquash/jpeg/encode.js";
import webpEncoder from "@jsquash/webp/codec/enc/webp_enc_simd.js";
import { initEmscriptenModule } from "@jsquash/webp/utils.js";
import { defaultOptions as webpOptions } from "@jsquash/webp/meta.js";
import JPEG_ENCODE from "@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm";
import WEBP_ENCODE from "@jsquash/webp/codec/enc/webp_enc_simd.wasm";

test("licensed portrait references downsample within the AI bounds while garment uploads keep their evidence", async () => {
  const source = syntheticPng(1200, 1800);
  const garment = await normalizeImage(source, "image/png");
  const reference = await normalizeImage(source, "image/png", 1024);
  expect([garment.width, garment.height]).toEqual([1200, 1800]);
  expect([reference.width, reference.height]).toEqual([683, 1024]);
  expect(inspectImage(reference.bytes, "image/png")).toMatchObject({
    width: 683,
    height: 1024,
  });
  const unchanged = await normalizeImage(
    syntheticPng(120, 180),
    "image/png",
    1024,
  );
  expect([unchanged.width, unchanged.height]).toEqual([120, 180]);
});

async function user(
  app: ReturnType<typeof createApp>,
  env: ReturnType<typeof memoryEnv>["env"],
) {
  const response = await app.request(
    "/auth/demo",
    { method: "POST", headers: { Origin: "http://localhost:4321" } },
    env,
  );
  const body = (await response.json()) as { data: { csrf: string } };
  return {
    Cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "",
    Origin: "http://localhost:4321",
    "X-CSRF-Token": body.data.csrf,
  };
}
describe("private standalone products and uploads", () => {
  test("JPEG and WebP are decoded and converted to canonical PNG", async () => {
    async function module(value: WebAssembly.Module) {
      return value instanceof WebAssembly.Module
        ? value
        : WebAssembly.compile(
            await Bun.file(value as unknown as string).arrayBuffer(),
          );
    }
    const rgba = {
      width: 8,
      height: 8,
      data: new Uint8ClampedArray(8 * 8 * 4).fill(255),
      colorSpace: "srgb",
    } as ImageData;
    await initJpegEncode(await module(JPEG_ENCODE));
    const webp = await initEmscriptenModule(
      webpEncoder,
      await module(WEBP_ENCODE),
    );
    for (const [buffer, mime] of [
      [await encodeJpeg(rgba), "image/jpeg"],
      [
        webp.encode(rgba.data, rgba.width, rgba.height, webpOptions).buffer,
        "image/webp",
      ],
    ] as const) {
      const result = await normalizeImage(new Uint8Array(buffer), mime);
      expect([result.width, result.height, result.mimeType]).toEqual([
        8,
        8,
        "image/png",
      ]);
    }
  });
  test("real decode/re-encode validates signatures, strips payload metadata and rejects malformed/pixel bombs", async () => {
    const image = await normalizeImage(syntheticPng(), "image/png");
    expect([image.width, image.height, image.mimeType]).toEqual([
      64,
      96,
      "image/png",
    ]);
    expect(inspectImage(image.bytes).width).toBe(64);
    expect(() => inspectImage(syntheticPng(), "image/jpeg")).toThrow();
    const bad = syntheticPng();
    new DataView(bad.buffer).setUint32(16, 100000);
    expect(() => inspectImage(bad)).toThrow();
    await expect(
      normalizeImage(
        new TextEncoder().encode("<svg><script/></svg>"),
        "image/png",
      ),
    ).rejects.toThrow();
    const corrupt = syntheticPng();
    corrupt.fill(0, 45, 55);
    await expect(normalizeImage(corrupt, "image/png")).rejects.toThrow();
  });
  function uploadForm(name = "Synthetic shirt", count = 1) {
    const form = new FormData();
    form.set("name", name);
    for (let i = 0; i < count; i++)
      form.append(
        "images",
        new File(
          [new Uint8Array(syntheticPng()).buffer],
          `synthetic-${i}.png`,
          { type: "image/png" },
        ),
      );
    return form;
  }
  test("blank upload titles start as unnamed auto products without using filenames or starting AI", async () => {
    const { env, sqlite } = memoryEnv(),
      app = createApp(),
      headers = await user(app, env);
    const response = await app.request(
      "/api/v1/products",
      { method: "POST", headers, body: uploadForm("") },
      env,
    );
    expect(response.status).toBe(201);
    const { data } = (await response.json()) as {
      data: { name: string; id: string };
    };
    expect(data.name).toBe("새 상품");
    expect(
      sqlite.query("SELECT name_source FROM products WHERE id=?").get(data.id),
    ).toEqual({ name_source: "auto" });
    expect(
      sqlite.query("SELECT count(*) n FROM generation_attempts").get(),
    ).toEqual({ n: 0 });
  });
  test("standalone uploads/list/delete enforce owner and CSRF; upload never invokes AI", async () => {
    const { env, objects } = memoryEnv(),
      app = createApp(),
      a = await user(app, env),
      b = await user(app, env);
    const network = spyOn(globalThis, "fetch").mockImplementation(
      Object.assign(
        async () => {
          throw Error("Unexpected provider call");
        },
        { preconnect: globalThis.fetch.preconnect },
      ),
    );
    try {
      const uploaded = await app.request(
        "/api/v1/products",
        { method: "POST", headers: a, body: uploadForm() },
        env,
      );
      expect(uploaded.status).toBe(201);
      const { data: product } = (await uploaded.json()) as {
        data: { id: string; assets: { id: string }[] };
      };
      expect(product).not.toHaveProperty("projectId");
      const asset = product.assets[0];
      if (!asset) throw Error("Missing synthetic asset");
      const downloaded = await app.request(
        `/api/v1/assets/${asset.id}/download`,
        { headers: a },
        env,
      );
      expect(downloaded.status).toBe(200);
      expect(downloaded.headers.get("cache-control")).toBe("private, no-store");
      expect(downloaded.headers.get("content-disposition")).toContain(
        "attachment",
      );
      const preset = (await (
        await app.request(
          "/api/v1/presets",
          {
            method: "POST",
            headers: a,
            body: JSON.stringify({
              name: "Synthetic preset",
              mood: "editorial",
              modelStyle: "adult",
              location: "studio",
              lighting: "soft",
            }),
          },
          env,
        )
      ).json()) as { data: { id: string } };
      for (const [path, method] of [
        [`/products/${product.id}`, "GET"],
        [`/products/${product.id}`, "DELETE"],
        [`/assets/${asset.id}/content`, "GET"],
        [`/assets/${asset.id}`, "DELETE"],
        [`/presets/${preset.data.id}`, "DELETE"],
      ])
        expect(
          (await app.request(`/api/v1${path}`, { method, headers: b }, env))
            .status,
        ).toBe(404);
      expect(
        (
          (await (
            await app.request("/api/v1/products", { headers: b }, env)
          ).json()) as { data: unknown[] }
        ).data,
      ).toEqual([]);
      expect(
        (
          await app.request(
            `/api/v1/products/${product.id}`,
            { method: "DELETE", headers: { ...a, "X-CSRF-Token": "forged" } },
            env,
          )
        ).status,
      ).toBe(403);
      expect(
        (await app.request("/api/v1/projects", { headers: a }, env)).status,
      ).toBe(410);
      expect(
        (
          await app.request(
            `/api/v1/products/${product.id}`,
            { method: "DELETE", headers: a },
            env,
          )
        ).status,
      ).toBe(200);
      expect(objects.size).toBe(0);
      expect(
        (
          await app.request(
            `/api/v1/assets/${asset.id}/content`,
            { headers: a },
            env,
          )
        ).status,
      ).toBe(404);
      expect(network).not.toHaveBeenCalled();
    } finally {
      network.mockRestore();
    }
  });
  test("initial registration accepts three garment previews and consented optional references, rolling back invalid combined uploads", async () => {
    const { env, sqlite, objects } = memoryEnv(),
      app = createApp(),
      headers = await user(app, env);
    const noRights = uploadForm();
    noRights.set(
      "lookImage",
      new File([new Uint8Array(syntheticPng()).buffer], "synthetic-look.png", {
        type: "image/png",
      }),
    );
    expect(
      (
        await app.request(
          "/api/v1/products",
          { method: "POST", headers, body: noRights },
          env,
        )
      ).status,
    ).toBe(400);
    const good = uploadForm("Synthetic multi-view", 3);
    good.set("rightsConfirmed", "true");
    for (const field of ["lookImage", "personImage"])
      good.set(
        field,
        new File(
          [new Uint8Array(syntheticPng(32, 48)).buffer],
          "synthetic-reference.png",
          { type: "image/png" },
        ),
      );
    const saved = await app.request(
      "/api/v1/products",
      { method: "POST", headers, body: good },
      env,
    );
    expect(saved.status).toBe(201);
    const data = (
      (await saved.json()) as { data: { assets: { kind: string }[] } }
    ).data;
    expect(data.assets.filter((a) => a.kind === "input")).toHaveLength(3);
    expect(
      data.assets.filter((a) => a.kind.endsWith("_reference")),
    ).toHaveLength(2);
    const sidebar = (
      (await (
        await app.request("/api/v1/products", { headers }, env)
      ).json()) as {
        data: {
          thumbnail: { kind: string };
          assets?: unknown;
          analysis?: unknown;
        }[];
      }
    ).data;
    expect(sidebar).toHaveLength(1);
    expect(sidebar[0]?.thumbnail.kind).toBe("input");
    expect(sidebar[0]).not.toHaveProperty("assets");
    expect(sidebar[0]).not.toHaveProperty("analysis");
    expect(
      sqlite.query("SELECT count(*) n FROM generation_jobs").get(),
    ).toEqual({ n: 0 });
    const bad = uploadForm("Synthetic failed combined", 2);
    bad.set("rightsConfirmed", "true");
    bad.set(
      "lookImage",
      new File([new Uint8Array([1, 2, 3]).buffer], "synthetic-invalid.png", {
        type: "image/png",
      }),
    );
    expect(
      (
        await app.request(
          "/api/v1/products",
          { method: "POST", headers, body: bad },
          env,
        )
      ).status,
    ).toBe(400);
    expect(sqlite.query("SELECT count(*) n FROM products").get()).toEqual({
      n: 1,
    });
    expect(objects.size).toBe(5);
  });
  test("R2 deletion failure keeps a retryable product and cleanup tombstones", async () => {
    const { env, sqlite } = memoryEnv(),
      app = createApp(),
      headers = await user(app, env);
    const response = await app.request(
      "/api/v1/products",
      { method: "POST", headers, body: uploadForm() },
      env,
    );
    const { data } = (await response.json()) as { data: { id: string } };
    const failure = spyOn(env.ASSETS, "delete").mockRejectedValue(
      new Error("Synthetic R2 failure"),
    );
    expect(
      (
        await app.request(
          `/api/v1/products/${data.id}`,
          { method: "DELETE", headers },
          env,
        )
      ).status,
    ).toBe(500);
    expect(sqlite.query("SELECT status FROM products").get()).toEqual({
      status: "deleting",
    });
    expect(
      sqlite.query("SELECT count(*) n FROM storage_cleanup").get(),
    ).toEqual({ n: 1 });
    failure.mockRestore();
    expect(
      (
        await app.request(
          `/api/v1/products/${data.id}`,
          { method: "DELETE", headers },
          env,
        )
      ).status,
    ).toBe(200);
    sqlite.exec("UPDATE storage_cleanup SET expires_at=0");
    await cleanupStorage(env);
    expect(
      sqlite.query("SELECT count(*) n FROM storage_cleanup").get(),
    ).toEqual({ n: 0 });
  });
});
