import { expect, test, type Page } from "@playwright/test";
import { syntheticPng } from "../../apps/api/test/png";
import { inspectImage } from "../../apps/api/src/image-meta";
import type { ProductDto } from "../../packages/schemas/src";
type CapturedPart = {
  field: string;
  name: string;
  type: string;
  bytes: number[];
};

// Synthetic photos only. The fixture cases below intercept all API calls.
async function studio(page: Page) {
  const uploads: Map<string, File[]>[] = [];
  // WebKit's inspector omits multipart file bytes (Playwright #6479).
  // The separate native roundtrip below also tests the actual Worker upload.
  await page.exposeFunction(
    "captureSyntheticUpload",
    (parts: CapturedPart[]) => {
      const images = new Map<string, File[]>();
      for (const key of ["images", "personImage", "lookImage"])
        images.set(key, []);
      for (const p of parts)
        images
          .get(p.field)
          ?.push(
            new File([Uint8Array.from(p.bytes)], p.name, { type: p.type }),
          );
      uploads.push(images);
    },
  );
  await page.addInitScript(() => {
    const browser = window as unknown as {
      fetch: (
        input: string | URL | Request,
        init?: RequestInit,
      ) => Promise<Response>;
    };
    const original = browser.fetch.bind(window);
    browser.fetch = async (input, init) => {
      if (
        init?.body instanceof FormData &&
        new URL(
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url,
          location.href,
        ).pathname === "/api/v1/products"
      ) {
        const parts: CapturedPart[] = [];
        for (const [field, value] of init.body.entries() as IterableIterator<
          [string, string | File]
        >)
          if (typeof value !== "string")
            parts.push({
              field,
              name: value.name,
              type: value.type,
              bytes: Array.from(new Uint8Array(await value.arrayBuffer())),
            });
        await (
          window as unknown as {
            captureSyntheticUpload: (p: CapturedPart[]) => Promise<void>;
          }
        ).captureSyntheticUpload(parts);
      }
      return original(input, init);
    };
  });
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "POST" && path === "/api/v1/products") {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "SYNTHETIC_UPLOAD_CHECKED",
            message: "Synthetic upload checked",
          },
        }),
      });
      return;
    }
    let data: unknown = [];
    if (path === "/api/v1/me")
      data = {
        csrf: "synthetic-csrf",
        connected: true,
        mode: "mock",
        deleting: false,
        models: { analysis: "mock", image: "mock" },
      };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ data }),
    });
  });
  await page.goto("/studio");
  await expect(
    page.getByRole("heading", { name: "어떤 옷을 촬영할까요?", exact: true }),
  ).toBeVisible();
  return uploads;
}
async function jpeg(page: Page) {
  return Buffer.from(
    await page.evaluate(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 100;
      canvas.height = 60;
      const context = canvas.getContext("2d");
      if (!context) throw Error("Missing test canvas");
      context.fillStyle = "#ff0000";
      context.fillRect(0, 0, 50, 60);
      context.fillStyle = "#0000ff";
      context.fillRect(50, 0, 50, 60);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(Error("Missing test JPEG"))),
          "image/jpeg",
          0.94,
        ),
      );
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    }),
  );
}

test("browser-readable photos with wrong/empty MIME, JPEG trailers and camera-sized dimensions become valid upload files", async ({
  page,
}) => {
  const uploads = await studio(page);
  const large = Buffer.from(syntheticPng(4032, 3024));
  const portrait = Buffer.concat([await jpeg(page), Buffer.from([0, 0, 0, 0])]);
  // Both used to reach the exact generic server rejection shown in the report.
  expect(() => inspectImage(large, "image/jpeg")).toThrow("정상적인 JPEG");
  expect(() => inspectImage(portrait, "image/png")).toThrow("정상적인 JPEG");
  await page.getByLabel("상품 사진", { exact: true }).setInputFiles({
    name: "synthetic-camera.jpg",
    mimeType: "image/jpeg",
    buffer: large,
  });
  await page.getByLabel("인물 참조 (선택)", { exact: true }).setInputFiles({
    name: "synthetic-portrait.png",
    mimeType: "image/png",
    buffer: portrait,
  });
  await page.getByLabel("촬영 레퍼런스 (선택)", { exact: true }).setInputFiles({
    name: "synthetic-look.png",
    mimeType: "",
    buffer: Buffer.from(syntheticPng(80, 100)),
  });
  expect(uploads).toHaveLength(0);
  await page.getByRole("button", { name: "촬영 시작", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Synthetic upload checked", {
    timeout: 30000,
  });
  expect(uploads).toHaveLength(1);
  const shot = uploads[0];
  if (!shot) throw Error("Missing synthetic upload");
  for (const key of ["images", "personImage", "lookImage"]) {
    const file = shot.get(key)?.[0];
    if (!file) throw Error("Missing synthetic file");
    const meta = inspectImage(
      new Uint8Array(await file.arrayBuffer()),
      file.type,
    );
    expect(meta.width * meta.height).toBeLessThanOrEqual(4_000_000);
    expect(Math.max(meta.width, meta.height)).toBeLessThanOrEqual(2048);
  }
  const garment = shot.get("images")?.[0];
  if (!garment) throw Error("Missing garment");
  expect(
    inspectImage(new Uint8Array(await garment.arrayBuffer()), garment.type),
  ).toMatchObject({ mime: "image/png", width: 2048, height: 1536 });
});

test("EXIF portrait orientation and misleading HEIC names/types are baked once into ordinary JPEG pixels", async ({
  page,
}) => {
  const uploads = await studio(page);
  const original = await jpeg(page);
  // APP1 Exif, little-endian TIFF, one Orientation=6 (90 degrees clockwise).
  const app1 = Buffer.from([
    0xff, 0xe1, 0, 34, 0x45, 0x78, 0x69, 0x66, 0, 0, 0x49, 0x49, 42, 0, 8, 0, 0,
    0, 1, 0, 0x12, 1, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0,
  ]);
  const oriented = Buffer.concat([
    original.subarray(0, 2),
    app1,
    original.subarray(2),
  ]);
  await page.getByLabel("상품 사진", { exact: true }).setInputFiles({
    name: "synthetic-portrait.HEIC",
    mimeType: "image/heic",
    buffer: oriented,
  });
  await page.getByRole("button", { name: "촬영 시작", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Synthetic upload checked");
  const file = uploads[0]?.get("images")?.[0];
  if (!file) throw Error("Missing normalized file");
  const bytes = new Uint8Array(await file.arrayBuffer());
  expect(inspectImage(bytes, file.type)).toMatchObject({
    mime: "image/jpeg",
    width: 60,
    height: 100,
  });
  expect(Buffer.from(bytes).includes(Buffer.from("Exif\0\0"))).toBe(false);
});

test("spoofed non-photos fail locally without posting or AI, and replacing the file clears the error and recovers", async ({
  page,
}) => {
  const uploads = await studio(page);
  await page.getByLabel("상품 사진", { exact: true }).setInputFiles({
    name: "synthetic-invalid.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
    ),
  });
  await page.getByRole("button", { name: "촬영 시작", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "상품 사진을 읽을 수 없어요",
  );
  expect(uploads).toHaveLength(0);
  await page
    .getByRole("button", { name: "상품 사진 1번 삭제", exact: true })
    .click();
  await page.getByLabel("상품 사진", { exact: true }).setInputFiles({
    name: "synthetic-valid.png",
    mimeType: "image/png",
    buffer: Buffer.from(syntheticPng()),
  });
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "촬영 시작", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Synthetic upload checked");
  expect(uploads).toHaveLength(1);
});

test("Mock: native browser multipart uploads a prepared camera photo to the private Worker and preserves its displayed dimensions", async ({
  page,
}) => {
  test.setTimeout(120000);
  const production = process.env.PHOTO_STUDIO_PRODUCTION_ORIGIN;
  const origin = production || "http://localhost:4321",
    api = production || "http://localhost:8787";
  if (production) {
    const sessions = JSON.parse(process.env.PHOTO_STUDIO_TEST_SESSIONS || "{}");
    const session = sessions[`upload:${test.info().project.name}`];
    if (!session) throw Error("Missing synthetic session");
    await page.context().addCookies([
      {
        name: "__Host-ps_session",
        value: session.token,
        url: origin,
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      },
    ]);
  } else
    await page.request.post(`${api}/auth/demo`, {
      headers: { Origin: origin },
    });
  const me = (await (await page.request.get(`${api}/api/v1/me`)).json()).data;
  expect(me.mode).toBe("mock");
  let productId: string | undefined;
  try {
    await page.goto("/studio");
    await page.getByLabel("상품 사진", { exact: true }).setInputFiles({
      name: "synthetic-camera.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from(syntheticPng(4032, 3024)),
    });
    const uploaded = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        new URL(r.url()).pathname === "/api/v1/products",
    );
    await page.getByRole("button", { name: "촬영 시작", exact: true }).click();
    const response = await uploaded;
    expect(response.status()).toBe(201);
    const product = (await response.json()).data as ProductDto;
    productId = product.id;
    expect(product.startupError).toBeFalsy();
    const asset = product.assets.find((a) => a.kind === "input");
    if (!asset) throw Error("Missing stored synthetic image");
    expect(asset).toMatchObject({
      width: 2048,
      height: 1536,
      mimeType: "image/png",
    });
    const content = await page.request.get(
      `${api}/api/v1/assets/${asset.id}/content`,
    );
    expect(content.status()).toBe(200);
    expect(
      inspectImage(new Uint8Array(await content.body()), "image/png"),
    ).toMatchObject({ width: 2048, height: 1536 });
  } finally {
    if (productId)
      expect(
        (
          await page.request.delete(`${api}/api/v1/products/${productId}`, {
            headers: { Origin: origin, "X-CSRF-Token": me.csrf },
          })
        ).ok(),
      ).toBe(true);
    if (!production)
      expect(
        (
          await page.request.delete(`${api}/api/v1/account`, {
            headers: { Origin: origin, "X-CSRF-Token": me.csrf },
            data: { confirm: "DELETE" },
          })
        ).ok(),
      ).toBe(true);
  }
});
