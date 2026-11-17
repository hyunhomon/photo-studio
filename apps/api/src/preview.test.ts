import { expect, test } from "bun:test";
import { studioFixture } from "../test/studio";
import { previewImage } from "./images";
import { syntheticPng } from "../test/png";
import { inspectImage } from "./image-meta";
import {
  automaticReferenceProvider,
  validateAutomaticReferenceConfig,
} from "./automatic-reference";
import { generateRequestSchema } from "@photo-studio/schemas";

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
  expect(r.headers.get("Cache-Control")).toBe("private, no-store");
  expect(r.headers.get("Content-Type")).toBe("image/jpeg");
  const bytes = await r.arrayBuffer();
  const r2 = await s.app.request(path, { headers: s.headers }, s.env);
  expect(await r2.arrayBuffer()).toEqual(bytes);
  const other = await s.login();
  expect((await s.app.request(path, { headers: other }, s.env)).status).toBe(
    404,
  );
  expect((await s.call(`/assets/${id}`, "DELETE")).status).toBe(200);
  expect(
    (await s.app.request(path, { headers: s.headers }, s.env)).status,
  ).toBe(404);
  expect(s.objects.size).toBe(0);
});
