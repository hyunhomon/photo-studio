import { describe, expect, test, spyOn } from "bun:test";
import { createApp } from "./app";
import { normalizeImage } from "./images";
import { inspectImage } from "./image-meta";
import { memoryEnv } from "../test/memory";
import { syntheticPng } from "../test/png";
import encodeJpeg, { init as initJpegEncode } from "@jsquash/jpeg/encode.js";
import webpEncoder from "@jsquash/webp/codec/enc/webp_enc_simd.js";
import { initEmscriptenModule } from "@jsquash/webp/utils.js";
import { defaultOptions as webpOptions } from "@jsquash/webp/meta.js";
import JPEG_ENCODE from "@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm";
import WEBP_ENCODE from "@jsquash/webp/codec/enc/webp_enc_simd.wasm";

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
describe("private projects and uploads", () => {
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
  test("A uploads/downloads/deletes; B cannot read or mutate any project/product/asset/preset; upload never invokes AI", async () => {
    const { env, objects } = memoryEnv();
    const app = createApp();
    const a = await user(app, env),
      b = await user(app, env);
    const network = spyOn(globalThis, "fetch").mockImplementation(
      Object.assign(
        async () => {
          throw new Error("Unexpected provider call");
        },
        { preconnect: globalThis.fetch.preconnect },
      ),
    );
    try {
      const created = await app.request(
        "/api/v1/projects",
        {
          method: "POST",
          headers: a,
          body: JSON.stringify({ name: "Synthetic collection" }),
        },
        env,
      );
      const { data: project } = (await created.json()) as {
        data: { id: string };
      };
      expect(created.status).toBe(201);
      const form = new FormData();
      form.set("name", "Synthetic shirt");
      form.append(
        "images",
        new File([new Uint8Array(syntheticPng()).buffer], "fixture.png", {
          type: "image/png",
        }),
      );
      const uploaded = await app.request(
        `/api/v1/projects/${project.id}/products`,
        { method: "POST", headers: a, body: form },
        env,
      );
      expect(uploaded.status).toBe(201);
      const { data: product } = (await uploaded.json()) as {
        data: { id: string; assets: { id: string }[] };
      };
      const asset = product.assets[0];
      expect(asset).toBeDefined();
      const downloaded = await app.request(
        `/api/v1/assets/${asset?.id}/download`,
        { headers: a },
        env,
      );
      expect(downloaded.status).toBe(200);
      expect(downloaded.headers.get("cache-control")).toBe("private, no-store");
      expect(downloaded.headers.get("content-disposition")).toContain(
        "attachment",
      );
      const spec = {
        name: "Synthetic preset",
        mood: "editorial",
        modelStyle: "adult",
        location: "studio",
        lighting: "soft",
      };
      const preset = (await (
        await app.request(
          "/api/v1/presets",
          { method: "POST", headers: a, body: JSON.stringify(spec) },
          env,
        )
      ).json()) as { data: { id: string } };
      for (const [path, method] of [
        [`/projects/${project.id}`, "GET"],
        [`/projects/${project.id}`, "DELETE"],
        [`/products/${product.id}`, "GET"],
        [`/assets/${asset?.id}/content`, "GET"],
        [`/assets/${asset?.id}`, "DELETE"],
        [`/presets/${preset.data.id}`, "DELETE"],
      ]) {
        expect(
          (await app.request(`/api/v1${path}`, { method, headers: b }, env))
            .status,
        ).toBe(404);
      }
      expect(
        (
          (await (
            await app.request("/api/v1/projects", { headers: b }, env)
          ).json()) as { data: unknown[] }
        ).data,
      ).toEqual([]);
      expect(
        (
          await app.request(
            `/api/v1/projects/${project.id}`,
            { method: "DELETE", headers: { ...a, "X-CSRF-Token": "forged" } },
            env,
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await app.request(
            `/api/v1/projects/${project.id}`,
            { method: "DELETE", headers: a },
            env,
          )
        ).status,
      ).toBe(200);
      expect(objects.size).toBe(0);
      expect(
        (
          await app.request(
            `/api/v1/assets/${asset?.id}/content`,
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
  test("R2 deletion failure keeps a retryable project and cleanup tombstones", async () => {
    const { env, sqlite } = memoryEnv();
    const app = createApp();
    const headers = await user(app, env);
    const created = (await (
      await app.request(
        "/api/v1/projects",
        {
          method: "POST",
          headers,
          body: JSON.stringify({ name: "Synthetic deletion recovery" }),
        },
        env,
      )
    ).json()) as { data: { id: string } };
    const form = new FormData();
    form.set("name", "Synthetic shirt");
    form.append(
      "images",
      new File([new Uint8Array(syntheticPng()).buffer], "fixture.png", {
        type: "image/png",
      }),
    );
    await app.request(
      `/api/v1/projects/${created.data.id}/products`,
      { method: "POST", headers, body: form },
      env,
    );
    const failure = spyOn(env.ASSETS, "delete").mockRejectedValue(
      new Error("Synthetic R2 failure"),
    );
    expect(
      (
        await app.request(
          `/api/v1/projects/${created.data.id}`,
          { method: "DELETE", headers },
          env,
        )
      ).status,
    ).toBe(500);
    expect(sqlite.query("SELECT status FROM projects").get()).toEqual({
      status: "deleting",
    });
    expect(
      sqlite.query("SELECT count(*) n FROM storage_cleanup").get(),
    ).toEqual({ n: 1 });
    failure.mockRestore();
    expect(
      (
        await app.request(
          `/api/v1/projects/${created.data.id}`,
          { method: "DELETE", headers },
          env,
        )
      ).status,
    ).toBe(200);
    expect(
      sqlite.query("SELECT count(*) n FROM storage_cleanup").get(),
    ).toEqual({ n: 0 });
  });
});
