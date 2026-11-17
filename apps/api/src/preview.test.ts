import { expect, test } from "bun:test";
import { studioFixture } from "../test/studio";
import { previewImage, preserveGeneratedImage } from "./images";
import { syntheticPng } from "../test/png";
import { inspectImage } from "./image-meta";
import { previewCacheControl } from "./preview-policy";
import {
  automaticReferenceProvider,
  validateAutomaticReferenceConfig,
} from "./automatic-reference";
import { generateRequestSchema } from "@photo-studio/schemas";

test("2K output keeps native bytes and dimensions; upload bounds stay strict and display previews alone downscale", async () => {
  const pixels = syntheticPng(1792, 2400);
  expect(() => inspectImage(pixels, "image/png")).toThrow("400만");
  const full = await preserveGeneratedImage(pixels, "image/png");
  expect(full.bytes).toBe(pixels);
  expect(full).toMatchObject({
    width: 1792,
    height: 2400,
    mimeType: "image/png",
  });
  const small = await previewImage(full.bytes, full.mimeType, 1024, true);
  expect(inspectImage(small.bytes, small.mimeType)).toMatchObject({
    width: 765,
    height: 1024,
    mime: "image/jpeg",
  });
  expect(() =>
    inspectImage(syntheticPng(2048, 3072), "image/png", "generated"),
  ).toThrow("600만");
});

test("production cannot enable retired Shutterstock and Nano refinement requires an existing generated source", async () => {
  const s = await studioFixture();
  const retired = {
    ...s.env,
    APP_ENV: "production",
    REFERENCE_SOURCE: "shutterstock",
  };
  expect(() => automaticReferenceProvider(retired)).toThrow(
    "SHUTTERSTOCK_RETIRED",
  );
  expect(() =>
    validateAutomaticReferenceConfig(retired, false, "shutterstock"),
  ).toThrow("SHUTTERSTOCK_RETIRED");
  expect(
    generateRequestSchema.safeParse({
      consent: true,
      idempotencyKey: crypto.randomUUID(),
      planId: crypto.randomUUID(),
      quality: "medium",
      count: 1,
      refinement: true,
    }).success,
  ).toBe(false);
});

test("display derivatives are bounded JPEGs; private cached previews cannot bypass owner checks or outlive asset deletion", async () => {
  const image = await previewImage(syntheticPng(1200, 1800), "image/png", 160);
  expect(inspectImage(image.bytes, image.mimeType)).toMatchObject({
    width: 107,
    height: 160,
    mime: "image/jpeg",
  });
  const s = await studioFixture();
  const id = s.product.assets[0]?.id;
  if (!id) throw new Error("Missing synthetic asset");
  const path = `/api/v1/assets/${id}/preview?size=160`;
  const r = await s.app.request(path, { headers: s.headers }, s.env);
  expect(r.status).toBe(200);
  expect(r.headers.get("Cache-Control")).toBe(previewCacheControl);
  expect(r.headers.get("Content-Type")).toBe("image/jpeg");
  const bytes = await r.arrayBuffer();
  const r2 = await s.app.request(path, { headers: s.headers }, s.env);
  expect(await r2.arrayBuffer()).toEqual(bytes);
  const etag = r.headers.get("ETag");
  expect(etag).toBeTruthy();
  const conditional = { ...s.headers, "If-None-Match": etag ?? "" };
  const get = s.env.ASSETS.get.bind(s.env.ASSETS);
  s.env.ASSETS.get = async () => {
    throw Error("Conditional read must not hit R2");
  };
  const unchanged = await s.app.request(path, { headers: conditional }, s.env);
  expect(unchanged.status).toBe(304);
  expect((await unchanged.arrayBuffer()).byteLength).toBe(0);
  s.env.ASSETS.get = get;
  const other = await s.login();
  expect(
    (
      await s.app.request(
        path,
        { headers: { ...other, "If-None-Match": etag ?? "" } },
        s.env,
      )
    ).status,
  ).toBe(404);
  expect((await s.call(`/assets/${id}`, "DELETE")).status).toBe(200);
  expect(
    (await s.app.request(path, { headers: conditional }, s.env)).status,
  ).toBe(404);
  expect(s.objects.size).toBe(0);
  expect(
    (
      await s.app.request(
        path,
        { headers: { "If-None-Match": etag ?? "" } },
        s.env,
      )
    ).status,
  ).toBe(401);
});

test("simultaneous filmstrip and display misses share one source decode and prebuild both variants", async () => {
  const s = await studioFixture();
  const asset = s.product.assets[0];
  if (!asset) throw Error("Missing synthetic asset");
  const source = [...s.objects.keys()][0];
  const get = s.env.ASSETS.get.bind(s.env.ASSETS);
  let reads = 0;
  s.env.ASSETS.get = async (...args) => {
    if (args[0] === source) reads++;
    return get(...args);
  };
  const paths = [
    `/api/v1/assets/${asset.id}/preview?size=160`,
    `/api/v1/assets/${asset.id}/preview`,
  ];
  const responses = await Promise.all(
    paths.map((path) => s.app.request(path, { headers: s.headers }, s.env)),
  );
  expect(responses.map((r) => r.status)).toEqual([200, 200]);
  expect(reads).toBe(1);
  expect(s.objects.size).toBe(3);
  expect(
    s.sqlite.query("SELECT count(*) n FROM storage_cleanup").get(),
  ).toEqual({ n: 0 });
});

test("deleting an asset while its preview writes finish cannot leave late derivatives behind", async () => {
  const s = await studioFixture();
  const asset = s.product.assets[0];
  if (!asset) throw Error("Missing synthetic asset");
  const put = s.env.ASSETS.put.bind(s.env.ASSETS);
  s.env.ASSETS.put = async (...args) => {
    const result = await put(...args);
    if (args[0].includes(".preview-v2-960-"))
      expect((await s.call(`/assets/${asset.id}`, "DELETE")).status).toBe(200);
    return result;
  };
  const response = await s.app.request(
    `/api/v1/assets/${asset.id}/preview`,
    { headers: s.headers },
    s.env,
  );
  expect(response.status).toBe(404);
  expect(s.objects.size).toBe(0);
  expect(
    s.sqlite.query("SELECT count(*) n FROM storage_cleanup").get(),
  ).toEqual({ n: 0 });
});
