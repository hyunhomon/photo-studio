import { expect, test, type Page } from "@playwright/test";
import type { PipelineDto, ProductDto } from "../../packages/schemas/src";
import { syntheticPng } from "../../apps/api/test/png";

const productionOrigin = process.env.PHOTO_STUDIO_PRODUCTION_ORIGIN;
const apiOrigin = productionOrigin || "http://localhost:8787";
const appOrigin = productionOrigin || "http://localhost:4321";
async function data<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(`${apiOrigin}/api/v1${path}`);
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { data: T }).data;
}

test("Mock: automatic photographic reference reaches planning and generation without manual search or upload", async ({
  page,
}) => {
  test.setTimeout(productionOrigin ? 240000 : 180000);
  if (productionOrigin) {
    const sessions = JSON.parse(
      process.env.PHOTO_STUDIO_TEST_SESSIONS || "{}",
    ) as Record<string, { token: string }>;
    const session = sessions[test.info().project.name];
    if (!session) throw new Error("Missing synthetic test session");
    await page.context().addCookies([
      {
        name: "__Host-ps_session",
        value: session.token,
        url: productionOrigin,
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      },
    ]);
  }
  let productId: string | undefined;
  let csrf: string | undefined;
  try {
    await page.goto("/studio");
    if (!productionOrigin)
      await page
        .getByRole("button", { name: "로컬 Mock 스튜디오 열기" })
        .click();
    await expect(
      page.getByRole("heading", { name: "어떤 옷을 촬영할까요?", exact: true }),
    ).toBeVisible({ timeout: 30000 });
    const me = await data<{ mode: string; csrf: string }>(page, "/me");
    expect(me.mode).toBe("mock");
    csrf = me.csrf;
    const form = page.getByRole("form", { name: "상품 등록 폼" });
    await expect(
      form.getByRole("button", { name: "Pinterest에서 찾기", exact: true }),
    ).toHaveCount(0);
    await form.getByLabel("상품 사진", { exact: true }).setInputFiles({
      name: "synthetic-automatic-garment.png",
      mimeType: "image/png",
      buffer: Buffer.from(syntheticPng(64, 80)),
    });
    await form.getByRole("button", { name: "상품 추가", exact: true }).click();
    await expect(page).toHaveURL(/\/studio\/products\//);
    productId = new URL(page.url()).pathname.split("/").at(-1);
    if (!productId) throw new Error("Missing synthetic product");
    const before = await data<ProductDto>(page, `/products/${productId}`);
    expect(
      before.assets.filter((asset) => asset.kind !== "input"),
    ).toHaveLength(0);
    const inspector = page.getByRole("complementary", {
      name: "촬영 설정 패널",
    });
    await expect(
      inspector.getByRole("button", { name: "기획 레퍼런스", exact: true }),
    ).toContainText("상품에 맞는 사진 자동 검색");
    const planRequest = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        new URL(request.url()).pathname.endsWith("/plan"),
    );
    await inspector
      .getByRole("button", { name: "분석 시작", exact: true })
      .click();
    expect((await planRequest).postDataJSON()).toMatchObject({
      useAutomaticReference: true,
      lookReferenceId: null,
    });
    await expect(
      inspector.getByRole("heading", { name: "촬영 콘셉트", exact: true }),
    ).toBeVisible({ timeout: 90000 });
    const pipeline = await data<PipelineDto>(
      page,
      `/products/${productId}/pipeline`,
    );
    const plan = pipeline.plans[0];
    const retrieval = pipeline.retrievals?.find(
      (entry) => entry.assetId === plan?.lookReferenceId,
    );
    expect(retrieval).toMatchObject({ status: "selected", provider: "mock" });
    expect(retrieval?.assetId).toBeTruthy();
    const product = await data<ProductDto>(page, `/products/${productId}`);
    expect(
      product.assets.find((asset) => asset.id === retrieval?.assetId)?.kind,
    ).toBe("auto_look_reference");
    const preview = inspector.getByRole("region", {
      name: "자동 레퍼런스 검색 결과",
      exact: true,
    });
    await expect(preview).toBeVisible();
    await expect(
      preview.getByText("Mock · 합성 참조", { exact: true }),
    ).toBeVisible();
    await expect
      .poll(async () =>
        preview
          .getByRole("img", {
            name: "자동으로 찾은 촬영 레퍼런스",
            exact: true,
          })
          .evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBeGreaterThan(0);
    await expect(
      preview.getByRole("link", { name: "원본 출처", exact: true }),
    ).toHaveCount(0);
    const generationRequest = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        new URL(request.url()).pathname.endsWith("/generate"),
    );
    await page
      .getByRole("button", { name: "이미지 생성", exact: true })
      .click();
    expect((await generationRequest).postDataJSON()).toMatchObject({
      useAutomaticReference: true,
      lookReferenceId: retrieval?.assetId,
      count: 1,
    });
    await expect(
      page.getByRole("button", { name: "결과 1 선택", exact: true }),
    ).toBeVisible({ timeout: 90000 });
    const finished = await data<PipelineDto>(
      page,
      `/products/${productId}/pipeline`,
    );
    expect(finished.jobs.filter((job) => job.kind === "generate")).toHaveLength(
      1,
    );
    expect(finished.retrievals).toHaveLength(1);
    await page.screenshot({
      path: `.tmp/automatic-reference-${test.info().project.name}.png`,
      fullPage: true,
    });
  } finally {
    if (productId && csrf) {
      const removed = await page.request.delete(
        `${apiOrigin}/api/v1/products/${productId}`,
        { headers: { Origin: appOrigin, "X-CSRF-Token": csrf } },
      );
      expect(removed.ok()).toBe(true);
    }
    // Production's shared synthetic session remains available for the later full-flow scenario.
    if (!productionOrigin && csrf) {
      const removed = await page.request.delete(`${apiOrigin}/api/v1/account`, {
        headers: { Origin: appOrigin, "X-CSRF-Token": csrf },
        data: { confirm: "DELETE" },
      });
      expect(removed.ok()).toBe(true);
    }
  }
});
