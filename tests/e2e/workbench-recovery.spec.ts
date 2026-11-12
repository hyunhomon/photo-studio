import { expect, test, type Page, type Route } from "@playwright/test";
import type { PipelineDto, ProductDto } from "../../packages/schemas/src";
import { mockAnalysisFixture } from "../../packages/ai/src/fixtures";
import { syntheticPng } from "../../apps/api/test/png";

// Browser-only synthetic HTTP fixtures. No real account, provider, or D1 writes.
const id = "synthetic-ui-recovery";
const productPath = `/api/v1/products/${id}`;
const product: ProductDto = {
  id,
  name: "Synthetic garment",
  status: "ready",
  analysis: null,
  createdAt: 1,
  assets: [
    {
      id: "synthetic-original",
      productId: id,
      kind: "input",
      mimeType: "image/png",
      sizeBytes: 100,
      width: 64,
      height: 80,
      createdAt: 1,
    },
  ],
};
const complete: PipelineDto = {
  plans: [
    {
      id: "synthetic-plan",
      version: 1,
      status: "draft",
      createdAt: 1,
      lookReferenceId: null,
      spec: {
        season: "spring",
        mood: "neutral",
        model: { style: "casual adult", pose: "standing", appearance: "" },
        camera: {
          framing: "전신 샷",
          angle: "아이 레벨",
          referenceComposition: "match",
          backgroundSeparation: "gentle",
        },
        location: { type: "studio", time: "day" },
        lighting: "soft daylight",
        materialDirection: "",
        mustPreserve: ["original garment"],
        referenceNotes: "",
        aspectRatio: "3:4",
      },
    },
  ],
  jobs: [],
};
async function json(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify({ data }),
  });
}
function gate() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
async function mockApi(
  page: Page,
  custom: (route: Route, path: string) => Promise<boolean> = async () => false,
) {
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (await custom(route, path)) return;
    if (route.request().method() !== "GET") {
      await route.fulfill({
        status: 405,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "SYNTHETIC_ONLY",
            message: "Unexpected write blocked",
          },
        }),
      });
      return;
    }
    if (path === "/api/v1/me")
      return json(route, {
        csrf: "synthetic-csrf",
        connected: true,
        mode: "mock",
        deleting: false,
        models: { analysis: "mock", image: "mock" },
      });
    if (path === "/api/v1/products")
      return json(route, [{ ...product, thumbnail: product.assets[0] }]);
    if (path === productPath) return json(route, product);
    if (path === `${productPath}/pipeline`)
      return json(route, { plans: [], jobs: [] });
    if (path === `${productPath}/results` || path === "/api/v1/presets")
      return json(route, []);
    if (/^\/api\/v1\/assets\/[^/]+\/content$/.test(path))
      return route.fulfill({
        contentType: "image/png",
        body: Buffer.from(syntheticPng(64, 80)),
      });
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "NOT_FOUND", message: "Synthetic route not found" },
      }),
    });
  });
}
async function paint(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

test("product read failures leave the loading state and can recover without reconnecting", async ({
  page,
}) => {
  let status = 503;
  const pending = gate();
  let first = true;
  await mockApi(page, async (route, path) => {
    if (path !== productPath) return false;
    if (first) {
      first = false;
      await pending.promise;
    }
    if (status !== 200)
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: status === 404 ? "NOT_FOUND" : "TEMPORARY_FAILURE",
            message: "Synthetic read failure",
          },
        }),
      });
    else await json(route, product);
    return true;
  });
  await page.goto(`/studio/products/${id}`);
  try {
    await expect(
      page.getByRole("status", {
        name: "상품을 불러오고 있습니다",
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    pending.release();
  }
  await expect(
    page.getByRole("heading", {
      name: "상품을 불러오지 못했어요.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("status", { name: "상품을 불러오고 있습니다", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "OpenRouter로 연결", exact: true }),
  ).toHaveCount(0);
  status = 404;
  await page
    .getByRole("button", { name: "다시 불러오기", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "상품을 찾을 수 없어요.", exact: true }),
  ).toBeVisible();
  status = 200;
  await page
    .getByRole("button", { name: "다시 불러오기", exact: true })
    .click();
  await expect(
    page.getByRole("complementary", { name: "촬영 설정 패널" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "상품을 찾을 수 없어요.", exact: true }),
  ).toHaveCount(0);
});

test("an older product response cannot replace the latest refreshed product", async ({
  page,
}) => {
  const delayed = gate();
  let calls = 0;
  await mockApi(page, async (route, path) => {
    if (path !== productPath) return false;
    const number = ++calls;
    if (number === 2) await delayed.promise;
    await json(route, {
      ...product,
      name:
        number === 2
          ? "Synthetic stale title"
          : number >= 3
            ? "Synthetic newest title"
            : product.name,
    });
    return true;
  });
  await page.goto(`/studio/products/${id}`);
  await expect(page.locator(".workbench-canvas h1")).toHaveText(product.name);
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent("studio:product-changed")),
  );
  await expect.poll(() => calls).toBe(2);
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent("studio:product-changed")),
  );
  await expect(page.locator(".workbench-canvas h1")).toHaveText(
    "Synthetic newest title",
  );
  const stale = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === productPath &&
      response.request().method() === "GET",
  );
  delayed.release();
  await (await stale).finished();
  await paint(page);
  await expect(page.locator(".workbench-canvas h1")).toHaveText(
    "Synthetic newest title",
  );
});

test("an older pipeline response cannot return a completed workbench to pending", async ({
  page,
}) => {
  const delayed = gate();
  let calls = 0;
  await mockApi(page, async (route, path) => {
    if (path === productPath) {
      await json(route, { ...product, analysis: mockAnalysisFixture });
      return true;
    }
    if (path !== `${productPath}/pipeline`) return false;
    const number = ++calls;
    if (number === 2) await delayed.promise;
    await json(
      route,
      number === 2
        ? {
            plans: [],
            jobs: [
              {
                id: "synthetic-stale-job",
                productId: id,
                kind: "plan",
                status: "running",
                stage: "planning",
                errorCode: null,
                createdAt: 1,
                finishedAt: null,
                attempts: [],
              },
            ],
          }
        : complete,
    );
    return true;
  });
  await page.goto(`/studio/products/${id}`);
  await expect(
    page.getByRole("button", { name: "이미지 생성", exact: true }),
  ).toBeEnabled();
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent("studio:product-changed")),
  );
  await expect.poll(() => calls).toBe(2);
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent("studio:product-changed")),
  );
  await expect.poll(() => calls).toBe(3);
  await expect(
    page.getByRole("button", { name: "이미지 생성", exact: true }),
  ).toBeEnabled();
  const stale = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `${productPath}/pipeline`,
  );
  delayed.release();
  await (await stale).finished();
  await paint(page);
  await expect(
    page.getByRole("button", { name: "이미지 생성", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("status", {
      name: "촬영 기획을 만들고 있습니다",
      exact: true,
    }),
  ).toHaveCount(0);
});

test("an in-flight original upload keeps its dialog open until storage completes", async ({
  page,
}) => {
  const pending = gate();
  let writes = 0;
  await mockApi(page, async (route, path) => {
    if (path !== `${productPath}/assets`) return false;
    writes++;
    await pending.promise;
    await json(route, {
      ...product,
      assets: [
        ...product.assets,
        { ...product.assets[0], id: "synthetic-added-original" },
      ],
    });
    return true;
  });
  await page.goto(`/studio/products/${id}`);
  await page
    .getByRole("button", { name: "원본 사진 추가", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "상품 사진 추가",
    exact: true,
  });
  await dialog.getByLabel("상품 사진", { exact: true }).setInputFiles({
    name: "synthetic-add.png",
    mimeType: "image/png",
    buffer: Buffer.from(syntheticPng(64, 80)),
  });
  // The picker also has a "사진 추가" control for selecting another local
  // file; target the form submission rather than that separate picker action.
  await dialog.locator('button[type="submit"]').click();
  try {
    await expect.poll(() => writes).toBe(1);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "닫기", exact: true }).click();
    await expect(dialog).toBeVisible();
  } finally {
    pending.release();
  }
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "원본 2 선택", exact: true }),
  ).toBeVisible();
  expect(writes).toBe(1);
});

test("an HTML 401 is a recoverable server error and never starts OAuth", async ({
  page,
}) => {
  let malformed = true;
  let oauthStarts = 0;
  await page.route("**/auth/openrouter/start", async (route) => {
    oauthStarts++;
    await route.fulfill({ status: 503, body: "Unexpected OAuth blocked" });
  });
  await mockApi(page, async (route, path) => {
    if (path !== "/api/v1/me" || !malformed) return false;
    await route.fulfill({
      status: 401,
      contentType: "text/html",
      body: "<html>Temporary gateway failure</html>",
    });
    return true;
  });
  await page.goto("/studio");
  await expect(
    page.getByRole("heading", {
      name: "스튜디오에 잠시 연결할 수 없어요.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/studio$/);
  expect(oauthStarts).toBe(0);
  malformed = false;
  await page.getByRole("button", { name: "다시 확인", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "어떤 옷을 촬영할까요?", exact: true }),
  ).toBeVisible();
  expect(oauthStarts).toBe(0);
});
