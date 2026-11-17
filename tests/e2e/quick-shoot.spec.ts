import { expect, test } from "@playwright/test";
import { syntheticPng } from "../../apps/api/test/png";
import type {
  PipelineDto,
  ProductSummaryDto,
} from "../../packages/schemas/src";
const origin =
  process.env.PHOTO_STUDIO_PRODUCTION_ORIGIN || "http://localhost:4321";
const api =
  process.env.PHOTO_STUDIO_PRODUCTION_ORIGIN || "http://localhost:8787";
test("Mock: select a photo and one execution continues analysis, plan and image across reload", async ({
  page,
}) => {
  test.setTimeout(180000);
  const production = process.env.PHOTO_STUDIO_PRODUCTION_ORIGIN;
  if (production) {
    const sessions = JSON.parse(process.env.PHOTO_STUDIO_TEST_SESSIONS || "{}");
    const session = sessions[test.info().project.name];
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
  } else {
    await page.request.post(`${api}/auth/demo`, {
      headers: { Origin: origin },
    });
  }
  const me = (await (await page.request.get(`${api}/api/v1/me`)).json()).data;
  expect(me.mode).toBe("mock");
  let productId: string | undefined;
  try {
    await page.goto(`${origin}/studio`);
    const before = (
      (await (await page.request.get(`${api}/api/v1/products`)).json())
        .data as ProductSummaryDto[]
    ).length;
    await page.getByLabel("상품 사진", { exact: true }).setInputFiles({
      name: "synthetic-quick.png",
      mimeType: "image/png",
      buffer: Buffer.from(syntheticPng(64, 80)),
    });
    expect(
      (
        (await (await page.request.get(`${api}/api/v1/products`)).json())
          .data as ProductSummaryDto[]
      ).length,
    ).toBe(before);
    await page.getByRole("button", { name: "촬영 시작", exact: true }).click();
    await expect(page).toHaveURL(/\/studio\/products\//, { timeout: 60000 });
    productId = new URL(page.url()).pathname.split("/").at(-1);
    if (!productId) throw Error("Missing created product");
    await page.reload();
    await expect(
      page.getByRole("button", { name: "결과 1 선택", exact: true }),
    ).toBeVisible({ timeout: 90000 });
    // The asset can be readable while its display derivatives and durable
    // completion are still committing. Seeing a thumbnail is not job completion.
    await expect
      .poll(
        async () => {
          const snapshot = (
            await (
              await page.request.get(
                `${api}/api/v1/products/${productId}/pipeline`,
              )
            ).json()
          ).data as PipelineDto;
          return snapshot.jobs[0]?.status;
        },
        { timeout: 60000, intervals: [1000, 2000] },
      )
      .toBe("needs_review");
    const pipeline = (
      await (
        await page.request.get(`${api}/api/v1/products/${productId}/pipeline`)
      ).json()
    ).data as PipelineDto;
    expect(pipeline.jobs).toHaveLength(1);
    expect(pipeline.jobs[0]).toMatchObject({
      kind: "shoot",
      status: "needs_review",
      useAutomaticReference: false,
    });
    expect(pipeline.jobs[0]?.attempts.map((a) => a.stage)).toEqual([
      "analysis",
      "planning",
      "generation",
    ]);
    expect(pipeline.plans).toHaveLength(1);
    await page.screenshot({
      path: `.tmp/quick-shoot-${test.info().project.name}.png`,
    });
  } finally {
    if (productId) {
      const r = await page.request.delete(
        `${api}/api/v1/products/${productId}`,
        { headers: { Origin: origin, "X-CSRF-Token": me.csrf } },
      );
      expect(r.ok()).toBe(true);
    }
  }
});
