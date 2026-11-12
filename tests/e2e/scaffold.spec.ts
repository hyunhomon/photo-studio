import { expect, test, type Locator, type Page } from "@playwright/test";
import type {
  JobDto,
  PipelineDto,
  ProductDto,
  ResultDto,
} from "../../packages/schemas/src";
import { syntheticPng } from "../../apps/api/test/png";

const productionOrigin = process.env.PHOTO_STUDIO_PRODUCTION_ORIGIN;
const apiOrigin = productionOrigin || "http://localhost:8787";
const appOrigin = productionOrigin || "http://localhost:4321";
const fixture = (name: string, width = 64) => ({
  name,
  mimeType: "image/png",
  buffer: Buffer.from(syntheticPng(width, width + 16)),
});

async function data<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(`${apiOrigin}/api/v1${path}`);
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { data: T }).data;
}

async function waitForWorkflow(page: Page, result: Locator) {
  const reconnect = page
    .getByRole("button", { name: "작업 연결 재확인", exact: true })
    .first();
  await expect(result.or(reconnect).first()).toBeVisible({ timeout: 60000 });
  if (!(await result.isVisible()) && (await reconnect.isVisible())) {
    // Reconcile the existing instance once; never submit a second paid job.
    await reconnect.click();
  }
  await expect(result).toBeVisible({ timeout: 60000 });
}

async function openNavigation(page: Page) {
  if (test.info().project.name === "mobile-chromium")
    await page.getByRole("button", { name: "상품 목록 열기" }).click();
}

async function verifyCustomChoices(page: Page) {
  const inspector = page.getByRole("complementary", { name: "촬영 설정 패널" });
  const framing = page.getByLabel("프레이밍 직접 입력", { exact: true });
  const angle = page.getByLabel("카메라 각도 직접 입력", { exact: true });
  for (const label of ["프레이밍", "카메라 각도"]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await page.getByRole("option", { name: "직접 입력", exact: true }).click();
  }
  // Manual editing remains manual even when the entered value equals a preset.
  await framing.fill("전신 샷");
  await expect(framing).toHaveValue("전신 샷");
  await framing.fill(`Synthetic_framing_${"A".repeat(200)}`);
  await angle.fill(`Synthetic_angle_${"B".repeat(200)}`);
  const sizes =
    test.info().project.name === "desktop-chromium"
      ? [
          [1440, 900],
          [1024, 640],
        ]
      : [
          [390, 844],
          [320, 700],
        ];
  for (const [width, height] of sizes) {
    if (!width || !height) throw new Error("Missing custom-control viewport");
    await page.setViewportSize({ width, height });
    await angle.focus();
    const bounds = await inspector.boundingBox();
    if (!bounds) throw new Error("Missing inspector");
    for (const input of [framing, angle]) {
      await expect(input).toBeVisible();
      const box = await input.boundingBox();
      if (!box) throw new Error("Missing custom input");
      expect(box.x).toBeGreaterThanOrEqual(bounds.x);
      expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width);
      // Long text scrolls inside the input, not in a wider panel.
      expect(
        await input.evaluate(
          (element) => element.scrollWidth > element.clientWidth,
        ),
      ).toBe(true);
    }
    const panelSizes = await inspector
      .locator(".planning-panel,.planning-tabs,.planning-scroll,fieldset")
      .evaluateAll((elements) =>
        elements.map((element) => ({
          width: element.clientWidth,
          scroll: element.scrollWidth,
        })),
      );
    for (const size of panelSizes)
      expect(size.scroll).toBeLessThanOrEqual(size.width + 1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width >= 1024) {
      expect(await page.evaluate(() => scrollY)).toBe(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollHeight <= innerHeight + 1,
        ),
      ).toBe(true);
      const scroller = inspector.locator(".planning-scroll");
      const before = await inspector.getByRole("tablist").boundingBox();
      await scroller.evaluate((element) =>
        element.scrollTo(0, element.scrollHeight),
      );
      expect(
        await scroller.evaluate((element) => element.scrollTop),
      ).toBeGreaterThan(0);
      expect((await inspector.getByRole("tablist").boundingBox())?.y).toBe(
        before?.y,
      );
      await scroller.evaluate((element) => element.scrollTo(0, 0));
    }
    await page.screenshot({
      path: `.tmp/custom-controls-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize(
    test.info().project.name === "desktop-chromium"
      ? { width: 1440, height: 1000 }
      : { width: 393, height: 851 },
  );
  await inspector.getByRole("tab", { name: "상품 이해", exact: true }).click();
  await inspector
    .getByRole("tab", { name: "촬영 콘셉트", exact: true })
    .click();
  await expect(framing).toHaveValue(`Synthetic_framing_${"A".repeat(200)}`);
  await expect(angle).toHaveValue(`Synthetic_angle_${"B".repeat(200)}`);
}

async function verifyComparisonLayout(page: Page) {
  const inspector = page.getByRole("complementary", { name: "촬영 설정 패널" });
  const original = page.getByRole("img", {
    name: "Synthetic shirt 원본 비교",
    exact: true,
  });
  const result = page.getByRole("img", {
    name: "Synthetic shirt 결과 비교",
    exact: true,
  });
  if (test.info().project.name === "desktop-chromium") {
    for (const [width, height] of [
      [1440, 1000],
      [1024, 768],
      [1440, 640],
    ] as const) {
      await page.setViewportSize({ width, height });
      await inspector
        .getByRole("tab", { name: "촬영 콘셉트", exact: true })
        .click();
      const scroller = inspector.locator(".planning-scroll");
      await scroller.evaluate((element) => element.scrollTo(0, 0));
      const tabsBefore = await inspector.getByRole("tablist").boundingBox();
      const before = await original.boundingBox();
      await scroller.evaluate((element) =>
        element.scrollTo(0, element.scrollHeight),
      );
      await expect
        .poll(() => scroller.evaluate((element) => element.scrollTop))
        .toBeGreaterThan(0);
      const after = await original.boundingBox(),
        panel = await inspector.boundingBox(),
        generated = await result.boundingBox();
      if (!before || !after || !panel || !generated)
        throw new Error("Missing comparison layout");
      const tabsAfter = await inspector.getByRole("tablist").boundingBox();
      expect(tabsAfter?.y).toBe(tabsBefore?.y);
      const outer = await page.evaluate(() => ({
        scroll: scrollY,
        height: document.documentElement.scrollHeight,
        viewport: innerHeight,
      }));
      expect(outer.scroll).toBe(0);
      expect(outer.height).toBeLessThanOrEqual(outer.viewport + 1);
      expect(Math.abs(before.y - after.y)).toBeLessThan(1);
      expect(Math.abs(before.x - after.x)).toBeLessThan(1);
      expect(after.x + after.width).toBeLessThan(panel.x);
      expect(generated.x + generated.width).toBeLessThan(panel.x);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `.tmp/product-workbench-${width}.png`,
        fullPage: true,
      });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
  } else {
    const canvas = await page.locator(".workbench-canvas").boundingBox(),
      panel = await inspector.boundingBox();
    if (!canvas || !panel) throw new Error("Missing responsive workbench");
    expect(panel.y).toBeGreaterThanOrEqual(canvas.y + canvas.height - 1);
    await page.screenshot({
      path: ".tmp/product-workbench-mobile.png",
      fullPage: true,
    });
  }
}

test("Mock: direct multi-photo upload, reference planning, compare, revise, export and delete", async ({
  page,
  browser,
}) => {
  test.setTimeout(productionOrigin ? 240000 : 180000);
  if (test.info().project.name === "desktop-chromium")
    await page.setViewportSize({ width: 1440, height: 1000 });
  const sessions = JSON.parse(
    process.env.PHOTO_STUDIO_TEST_SESSIONS || "{}",
  ) as Record<string, { token: string }>;
  if (productionOrigin) {
    const session = sessions[test.info().project.name];
    if (!session) throw new Error("Missing synthetic test user session");
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
  const errors: string[] = [],
    unexpected: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (["blob:", "data:"].includes(url.protocol)) return;
    const analytics =
      productionOrigin &&
      ((url.origin === "https://static.cloudflareinsights.com" &&
        url.pathname.startsWith("/beacon.min.js")) ||
        (url.origin === productionOrigin && url.pathname === "/cdn-cgi/rum"));
    if (
      !analytics &&
      !["localhost", "127.0.0.1"].includes(url.hostname) &&
      url.origin !== productionOrigin
    )
      unexpected.push("off-origin request");
  });
  await page.goto("/");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
  await expect(page.locator("html")).toHaveCSS(
    "background-color",
    "rgb(11, 12, 14)",
  );
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "상품 사진에서",
  );
  await page
    .getByRole("link", { name: "사진으로 촬영 시작하기", exact: true })
    .click();
  if (!productionOrigin) {
    const connected = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/auth/demo",
    );
    await page.getByRole("button", { name: "로컬 Mock 스튜디오 열기" }).click();
    expect((await connected).ok()).toBe(true);
  }
  await expect(
    page.getByRole("heading", { name: "어떤 옷을 촬영할까요?", exact: true }),
  ).toBeVisible({ timeout: 30000 });
  // This scenario must never consume funded OpenRouter credits, even remotely.
  expect((await data<{ mode: string }>(page, "/me")).mode).toBe("mock");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
  await expect(page.locator("html")).toHaveCSS(
    "background-color",
    "rgb(11, 12, 14)",
  );
  await expect(page.getByLabel("프로젝트 이름")).toHaveCount(0);
  const form = page.getByRole("form", { name: "상품 등록 폼" });
  const upload = form.getByLabel("상품 사진", { exact: true });
  await expect(form.getByRole("textbox")).toHaveCount(0);
  await expect(
    form.getByRole("button", { name: "Pinterest에서 찾기", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("header")).toHaveCount(0);
  const pickers = form.locator(".photo-picker");
  await expect(pickers).toHaveCount(3);
  const boxes = await pickers.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width };
    }),
  );
  expect(
    Math.max(...boxes.map((box) => box.y)) -
      Math.min(...boxes.map((box) => box.y)),
  ).toBeLessThan(1);
  if (!boxes[0] || !boxes[1] || !boxes[2])
    throw new Error("Missing upload columns");
  expect(boxes[1].x).toBeGreaterThan(boxes[0].x + boxes[0].width);
  expect(boxes[2].x).toBeGreaterThan(boxes[1].x + boxes[1].width);
  await expect(page.locator("html")).toHaveCSS("scrollbar-width", "none");
  await upload.setInputFiles(fixture("synthetic-front.png"));
  await expect(
    form.getByRole("img", { name: "상품 사진 미리보기 1", exact: true }),
  ).toHaveJSProperty("naturalWidth", 64);
  // A second selection appends rather than replacing the existing preview.
  await upload.setInputFiles(fixture("synthetic-back.png", 72));
  await upload.setInputFiles(fixture("synthetic-detail.png", 80));
  await expect(form.getByRole("status")).toHaveText("3 / 3");
  await form
    .getByRole("button", { name: "상품 사진 이전 사진", exact: true })
    .click();
  await expect(
    form.getByRole("img", { name: "상품 사진 미리보기 2", exact: true }),
  ).toHaveJSProperty("naturalWidth", 72);
  await form
    .getByRole("button", { name: "상품 사진 2번 삭제", exact: true })
    .click();
  await form
    .getByRole("button", { name: "상품 사진 다음 사진", exact: true })
    .click();
  await expect(
    form.getByRole("img", { name: "상품 사진 미리보기 2", exact: true }),
  ).toHaveJSProperty("naturalWidth", 80);
  await expect(form.getByRole("status")).toHaveText("2 / 2");
  await form
    .getByLabel("촬영 레퍼런스 (선택)", { exact: true })
    .setInputFiles(fixture("synthetic-look.png", 40));
  await expect(
    form.getByRole("img", {
      name: "촬영 레퍼런스 (선택) 미리보기 1",
      exact: true,
    }),
  ).toHaveJSProperty("naturalWidth", 40);
  const personInput = form.getByLabel("인물 참조 (선택)", { exact: true });
  await personInput.setInputFiles(fixture("synthetic-person-preview.png", 32));
  await expect(
    form.getByRole("img", { name: "인물 참조 (선택) 미리보기 1", exact: true }),
  ).toHaveJSProperty("naturalWidth", 32);
  await form
    .getByRole("button", { name: "인물 참조 (선택) 1번 삭제", exact: true })
    .click();
  await expect(
    form.getByRole("img", { name: "인물 참조 (선택) 미리보기 1", exact: true }),
  ).toHaveCount(0);
  for (const image of await form.getByRole("img").all()) {
    const photo = await image.boundingBox(),
      slot = await image
        .locator(
          "xpath=ancestor::fieldset[contains(concat(' ', @class, ' '), ' photo-picker ')]",
        )
        .boundingBox();
    if (!photo || !slot) throw new Error("Missing preview boundary");
    expect(photo.x).toBeGreaterThanOrEqual(slot.x);
    expect(photo.y).toBeGreaterThanOrEqual(slot.y);
    expect(photo.x + photo.width).toBeLessThanOrEqual(slot.x + slot.width);
    expect(photo.y + photo.height).toBeLessThanOrEqual(slot.y + slot.height);
  }
  await form.screenshot({
    path: `.tmp/product-upload-${test.info().project.name}.png`,
  });
  await form.getByRole("button", { name: "상품 추가", exact: true }).click();
  await expect(page).toHaveURL(/\/studio\/products\//);
  const productUrl = page.url(),
    productId = new URL(productUrl).pathname.split("/").at(-1);
  if (!productId) throw new Error("Missing created product");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("새 상품");
  // A name is no longer part of registration. Exercise sidebar rename instead.
  await openNavigation(page);
  const initialRow = page
    .locator("[data-product-id]")
    .filter({ has: page.getByRole("link", { name: "새 상품", exact: true }) });
  await initialRow.hover();
  await initialRow
    .getByRole("button", { name: "상품 제목 수정", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .last()
    .getByLabel("상품 제목", { exact: true })
    .fill("Synthetic shirt");
  await page.getByRole("button", { name: "제목 저장", exact: true }).click();
  if (test.info().project.name === "mobile-chromium")
    await page
      .getByRole("button", { name: "상품 목록 닫기", exact: true })
      .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Synthetic shirt",
  );
  await expect(page.getByText("의류 원본 3장", { exact: true })).toHaveCount(0);
  await expect(
    page
      .getByRole("group", { name: "원본 사진 선택", exact: true })
      .locator("button[aria-pressed]"),
  ).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "원본 사진 추가", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "원본 추가", exact: true }),
  ).toHaveCount(0);
  const original = page.getByRole("img", {
    name: "Synthetic shirt 원본 비교",
    exact: true,
  });
  await expect(original).toHaveJSProperty("naturalWidth", 64);
  await expect(
    page.getByRole("button", { name: "원본 1 선택", exact: true }),
  ).toHaveCSS("border-top-width", "2px");

  await page.getByRole("button", { name: "원본 2 선택", exact: true }).click();
  await expect(original).toHaveJSProperty("naturalWidth", 80);
  await page.getByRole("button", { name: "원본 1 선택", exact: true }).click();
  const product = await data<ProductDto>(page, `/products/${productId}`),
    look = product.assets.find((asset) => asset.kind === "look_reference");
  expect(product.assets.filter((asset) => asset.kind === "input")).toHaveLength(
    2,
  );
  expect(look).toBeDefined();
  if (!look) throw new Error("Missing initial photographic reference");
  expect(
    (await data<PipelineDto>(page, `/products/${productId}/pipeline`)).jobs,
  ).toHaveLength(0);

  await page.keyboard.press("Control+k");
  await page
    .getByRole("combobox", { name: "상품 검색어" })
    .fill("Synthetic shirt");
  await expect(
    page.getByRole("option", { name: "Synthetic shirt", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "상품 검색" })).toHaveCount(0);
  await expect(page).toHaveURL(productUrl);
  if (test.info().project.name === "mobile-chromium") {
    await openNavigation(page);
    await expect(
      page
        .getByRole("navigation", { name: "상품 목록" })
        .getByRole("link", { name: "Synthetic shirt", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "상품 목록 열기" }),
    ).toBeFocused();
  } else {
    await expect(
      page
        .getByRole("navigation", { name: "상품 목록" })
        .getByRole("link", { name: "Synthetic shirt", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      page.getByRole("button", { name: "사이드바 접기" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "내 상품", exact: true }),
    ).toBeVisible();
  }
  if (test.info().project.name === "desktop-chromium") {
    const other = await browser.newContext();
    let cleanupCsrf: string | undefined;
    if (productionOrigin) {
      const session = sessions["mobile-chromium"];
      if (!session) throw new Error("Missing synthetic second user");
      await other.addCookies([
        {
          name: "__Host-ps_session",
          value: session.token,
          url: productionOrigin,
          httpOnly: true,
          secure: true,
          sameSite: "Lax",
        },
      ]);
    } else {
      const response = await other.request.post(`${apiOrigin}/auth/demo`, {
        headers: { Origin: appOrigin },
      });
      expect(response.ok()).toBe(true);
      cleanupCsrf = ((await response.json()) as { data: { csrf: string } }).data
        .csrf;
    }
    try {
      expect(
        (
          await other.request.get(`${apiOrigin}/api/v1/products/${productId}`)
        ).status(),
      ).toBe(404);
      const src = await original.getAttribute("src");
      if (!src) throw new Error("Missing synthetic asset URL");
      expect((await other.request.get(src)).status()).toBe(404);
      expect(
        (
          await other.request.get(
            `${apiOrigin}/api/v1/assets/${look.id}/content`,
          )
        ).status(),
      ).toBe(404);
    } finally {
      if (cleanupCsrf)
        await other.request.delete(`${apiOrigin}/api/v1/account`, {
          headers: { Origin: appOrigin, "X-CSRF-Token": cleanupCsrf },
          data: { confirmation: "삭제" },
        });
      await other.close();
    }
  }
  const inspector = page.getByRole("complementary", { name: "촬영 설정 패널" });
  await expect(
    inspector.getByRole("tab", { name: "기획", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  const planningRequest = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      new URL(request.url()).pathname.endsWith("/plan"),
  );
  await page.getByRole("button", { name: "분석 시작", exact: true }).click();
  expect((await planningRequest).postDataJSON()).toMatchObject({
    lookReferenceId: look.id,
    referenceConsent: true,
    reuseAnalysis: false,
  });
  await waitForWorkflow(
    page,
    page.getByRole("heading", { name: "촬영 콘셉트", exact: true }),
  );
  await expect(
    inspector.getByRole("tab", { name: "촬영 콘셉트", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("레퍼런스 관찰", { exact: true })).toBeVisible();
  const initialPipeline = await data<PipelineDto>(
    page,
    `/products/${productId}/pipeline`,
  );
  expect(initialPipeline.plans[0]?.lookReferenceId).toBe(look.id);
  expect(initialPipeline.plans[0]?.spec.referenceNotes.length).toBeGreaterThan(
    0,
  );
  await inspector.getByRole("tab", { name: "상품 이해", exact: true }).click();
  await page.getByLabel("의류 종류", { exact: true }).fill("수정한 셔츠");
  await expect(
    page.getByRole("button", { name: "분석 수정 저장" }),
  ).toHaveCount(0);
  await expect(page.getByLabel("의류 종류", { exact: true })).toHaveValue(
    "수정한 셔츠",
  );
  await inspector.getByRole("tab", { name: "기획", exact: true }).click();
  const actions = inspector.getByRole("group", {
    name: "기획 실행",
    exact: true,
  });
  const restart = await actions
    .getByRole("button", { name: "상품 재분석·기획", exact: true })
    .boundingBox();
  const replan = await actions
    .getByRole("button", { name: "기획만 재생성", exact: true })
    .boundingBox();
  if (!restart || !replan) throw new Error("Missing grouped planning actions");
  expect(Math.abs(restart.y - replan.y)).toBeLessThan(1);
  const planningOnlyResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/plan"),
  );
  await page
    .getByRole("button", { name: "기획만 재생성", exact: true })
    .click();
  const planningOnly = (
    (await (await planningOnlyResponse).json()) as { data: { id: string } }
  ).data;
  await waitForWorkflow(page, page.getByText("V2", { exact: true }));
  const planningJob = await data<JobDto>(page, `/jobs/${planningOnly.id}`);
  expect(planningJob.attempts.map((attempt) => attempt.stage)).toEqual([
    "planning",
  ]);
  expect(
    (await data<ProductDto>(page, `/products/${productId}`)).analysis
      ?.garmentType,
  ).not.toBe("수정한 셔츠");
  // Append after completed planning without starting AI or changing old plans.
  await page
    .getByRole("button", { name: "원본 사진 추가", exact: true })
    .click();
  const appendDialog = page.getByRole("dialog", {
    name: "상품 사진 추가",
    exact: true,
  });
  await appendDialog
    .getByLabel("상품 사진", { exact: true })
    .setInputFiles(fixture("synthetic-back.png", 72));
  await appendDialog
    .getByRole("button", { name: "사진 추가", exact: true })
    .click();
  await expect(appendDialog).toHaveCount(0);
  await expect(
    page
      .getByRole("group", { name: "원본 사진 선택", exact: true })
      .locator("button[aria-pressed]"),
  ).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "원본 사진 추가", exact: true }),
  ).toBeDisabled();
  const originalFrame = page.getByRole("figure", {
    name: "원본 사진",
    exact: true,
  });
  const frameBounds = await originalFrame.boundingBox();
  const zoomBounds = await originalFrame
    .getByRole("button", { name: "비교 기준 사진 확대", exact: true })
    .boundingBox();
  if (!frameBounds || !zoomBounds)
    throw new Error("Missing original gallery controls");
  expect(zoomBounds.x).toBeGreaterThanOrEqual(frameBounds.x);
  expect(zoomBounds.x + zoomBounds.width).toBeLessThanOrEqual(
    frameBounds.x + frameBounds.width,
  );
  expect(
    (await data<PipelineDto>(page, `/products/${productId}/pipeline`)).jobs,
  ).toHaveLength(2);
  await page.getByRole("button", { name: "원본 3 선택", exact: true }).click();
  await expect(original).toHaveJSProperty("naturalWidth", 72);
  await page.getByRole("button", { name: "원본 1 선택", exact: true }).click();
  await verifyCustomChoices(page);
  await page.getByRole("button", { name: "프레이밍", exact: true }).click();
  await page
    .getByRole("option", { name: "바스트 샷 · 가슴 위", exact: true })
    .click();
  await page.getByRole("button", { name: "카메라 각도", exact: true }).click();
  await page
    .getByRole("option", {
      name: "버드아이 뷰 · 수직으로 내려다보기",
      exact: true,
    })
    .click();
  const light = await page.getByLabel("조명", { exact: true }).boundingBox();
  const referenceMode = await page
    .getByRole("button", { name: "레퍼런스 반영", exact: true })
    .boundingBox();
  if (!light || !referenceMode) throw new Error("Missing adjacent controls");
  expect(referenceMode.y - (light.y + light.height)).toBeGreaterThanOrEqual(16);
  await expect(
    page
      .getByRole("button", { name: "레퍼런스 반영", exact: true })
      .locator("svg"),
  ).toHaveAttribute("width", "16");
  await expect(page.getByText(/원본의 보존 포인트를 확인하고/)).toHaveCount(0);
  await expect(
    page.getByText(/인물 참조가 있으면 해당 얼굴을 우선/),
  ).toHaveCount(0);
  await expect(
    page.getByText("생성 1회 · OpenRouter 사용료 발생", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "배경 분리", exact: true }).click();
  await page
    .getByRole("option", { name: "분리감 있게 · 멀리 있는 배경", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "콘셉트 승인", exact: true }),
  ).toHaveCount(0);

  await inspector.getByRole("tab", { name: "기획", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "촬영감 참조 사진", exact: true }),
  ).toHaveJSProperty("naturalWidth", 40);
  await page
    .getByRole("button", { name: "인물 사진 등록", exact: true })
    .click();
  await page
    .getByLabel("인물 참조 사진 선택", { exact: true })
    .setInputFiles(fixture("synthetic-person.png", 32));
  await page.getByRole("button", { name: "사진 저장", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("img", { name: "인물 참조 사진", exact: true }),
  ).toHaveJSProperty("naturalWidth", 32);
  expect(
    (await data<PipelineDto>(page, `/products/${productId}/pipeline`)).jobs,
  ).toHaveLength(2);

  // Synthetic UI-only delay: the real Mock adapter completes normally. Keep its
  // pipeline snapshot visibly active until the large pending canvas is checked.
  // No extra inference call or provider delay is introduced by this fixture.
  let showPending = true;
  const pipelinePattern = `**/api/v1/products/${productId}/pipeline`;
  await page.route(pipelinePattern, async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { data: PipelineDto };
    if (showPending) {
      const job = body.data.jobs.find((item) => item.kind === "generate");
      if (job)
        Object.assign(job, {
          status: "running",
          stage: "generation",
          finishedAt: null,
        });
    }
    await route.fulfill({ response, json: body });
  });
  const generationRequest = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      new URL(request.url()).pathname.endsWith("/generate"),
  );
  await page.getByRole("button", { name: "이미지 생성", exact: true }).click();
  expect((await generationRequest).postDataJSON()).toMatchObject({
    lookReferenceId: look.id,
    personReferenceId: expect.any(String),
    referenceConsent: true,
    count: 1,
    editedAnalysis: { garmentType: "수정한 셔츠" },
    editedPlan: {
      camera: {
        backgroundSeparation: "separated",
        framing: "바스트 샷 · 가슴 위",
        angle: "버드아이 뷰 · 수직으로 내려다보기",
      },
    },
  });
  await expect
    .poll(
      async () =>
        (await data<ProductDto>(page, `/products/${productId}`)).analysis
          ?.garmentType,
    )
    .toBe("수정한 셔츠");
  const pending = page.getByRole("status", {
    name: "이미지를 생성하고 있습니다",
    exact: true,
  });
  try {
    await expect(pending).toBeVisible();
    await expect(pending).toHaveAttribute("aria-busy", "true");
    await expect(pending.getByText(/초 경과/)).toHaveCount(0);
    await expect(
      pending.locator('ol[aria-label="진행 단계"] [aria-current="step"]'),
    ).toHaveCSS("color", "rgb(0, 245, 155)");
    await expect(pending.locator("li.rounded-full")).toHaveCount(0);

    await expect(
      page.getByRole("button", { name: "이미지 생성", exact: true }),
    ).toBeDisabled();
    const size = await pending.boundingBox();
    const frame = await page.locator(".result-frame").boundingBox();
    if (!size || !frame) throw new Error("Missing result frame");
    expect(size.width).toBeGreaterThan(120);
    expect(size.x).toBeGreaterThanOrEqual(frame.x - 1);
    expect(size.y).toBeGreaterThanOrEqual(frame.y - 1);
    expect(size.x + size.width).toBeLessThanOrEqual(frame.x + frame.width + 1);
    expect(size.y + size.height).toBeLessThanOrEqual(
      frame.y + frame.height + 1,
    );
    await page.locator("#results").screenshot({
      path: `.tmp/product-pending-${test.info().project.name}.png`,
    });
  } finally {
    showPending = false;
  }
  await expect(pending).toHaveCount(0, { timeout: 60000 });
  await page.unrouteAll({ behavior: "wait" });
  await waitForWorkflow(
    page,
    page.getByRole("img", { name: "Synthetic shirt 결과 비교", exact: true }),
  );
  await expect(
    page.getByRole("img", { name: "Synthetic shirt 결과 비교", exact: true }),
  ).toHaveJSProperty("naturalWidth", 64);
  await expect(
    page.getByRole("button", { name: "채택", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("상품 충실도", { exact: true })).toHaveCount(0);
  const firstResults = await data<ResultDto[]>(
    page,
    `/products/${productId}/results`,
  );
  expect(firstResults[0]?.personReferenceUsed).toBe(true);
  expect(firstResults[0]?.lookReferenceUsed).toBe(true);
  await page.getByRole("button", { name: "결과 1 선택", exact: true }).click();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: "PNG 다운로드" }).click();
  expect((await downloadEvent).suggestedFilename()).toBe("photo-studio.png");
  await inspector
    .getByRole("tab", { name: "촬영 콘셉트", exact: true })
    .click();
  await page.getByRole("button", { name: "프레이밍", exact: true }).click();
  await page
    .getByRole("option", { name: "미디엄 샷 · 허리 위", exact: true })
    .click();
  await page.getByRole("button", { name: "카메라 각도", exact: true }).click();
  await page
    .getByRole("option", { name: "로우 앵글 · 아래에서 위로", exact: true })
    .click();
  await page.getByRole("button", { name: "이 컷 개선", exact: true }).click();
  await page.getByRole("button", { name: "개선할 항목", exact: true }).click();
  await page
    .getByRole("option", {
      name: "인물 · 얼굴과 자세의 자연스러움",
      exact: true,
    })
    .click();
  await page
    .getByLabel("이번 컷에 반영할 요청 (선택)")
    .fill("Synthetic relaxed expression revision");
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page
    .getByRole("button", { name: "수정해서 생성", exact: true })
    .click();
  await waitForWorkflow(
    page,
    page.getByRole("button", { name: "결과 2 선택", exact: true }),
  );
  await expect(page.getByRole("button", { name: /결과 \d+ 선택/ })).toHaveCount(
    2,
    { timeout: 60000 },
  );
  const revised = await data<ResultDto[]>(
    page,
    `/products/${productId}/results`,
  );
  await expect(
    page.getByRole("img", { name: "Synthetic shirt 결과 비교", exact: true }),
  ).toHaveAttribute(
    "src",
    new RegExp(revised[0]?.asset.id ?? "missing-latest-result"),
  );
  expect(revised[0]).toMatchObject({
    personReferenceUsed: true,
    lookReferenceUsed: true,
    regenerationOf: firstResults[0]?.asset.id,
    regenerationReason: "human_naturalness",
  });
  await page
    .getByRole("button", { name: "이전 컷과 비교", exact: true })
    .click();
  await expect(
    page.getByRole("img", {
      name: "Synthetic shirt 이전 컷 비교",
      exact: true,
    }),
  ).toHaveJSProperty("naturalWidth", 64);
  await page
    .getByRole("button", { name: "원본 의류와 비교", exact: true })
    .click();
  await page.locator("#results").screenshot({
    path: `.tmp/product-review-${test.info().project.name}.png`,
  });
  const gallery = page.getByRole("group", {
    name: "생성 결과 선택",
    exact: true,
  });
  const photoFrame = page.locator(".result-frame");
  const strip = photoFrame.locator(".photo-filmstrip");
  expect(await gallery.boundingBox()).not.toBeNull();
  await gallery
    .getByRole("button", { name: "결과 1 선택", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "Synthetic shirt 결과 비교", exact: true }),
  ).toHaveAttribute(
    "src",
    new RegExp(revised[1]?.asset.id ?? "missing-synthetic-result"),
  );
  await gallery
    .getByRole("button", { name: "결과 2 선택", exact: true })
    .click();
  const frameBox = await photoFrame.boundingBox(),
    stripBox = await strip.boundingBox();
  if (!frameBox || !stripBox) throw new Error("Missing filmstrip");
  expect(stripBox.y + stripBox.height).toBeLessThanOrEqual(
    frameBox.y + frameBox.height + 1,
  );
  await page
    .getByRole("button", { name: "결과 사진 확대", exact: true })
    .click();
  const viewer = page.getByRole("dialog", { name: "사진 확대", exact: true });
  await expect(viewer).toBeVisible();
  const panel = await page.locator(".image-viewer").boundingBox(),
    viewport = page.viewportSize();
  if (!panel || !viewport) throw new Error("Missing image viewer");
  expect(panel.width).toBeGreaterThan(viewport.width * 0.9);
  expect(panel.height).toBeGreaterThan(viewport.height * 0.9);
  await expect(
    viewer.getByRole("img", { name: "확대 사진", exact: true }),
  ).toHaveJSProperty("naturalWidth", 64);
  await viewer.screenshot({
    path: `.tmp/large-viewer-${test.info().project.name}.png`,
  });
  await page
    .getByRole("button", { name: "원본 크기로 보기", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "화면에 맞추기", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "결과 사진 확대", exact: true }),
  ).toBeFocused();
  await verifyComparisonLayout(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);

  let releaseSession: () => void = () => {};
  const sessionGate = new Promise<void>((resolve) => {
    releaseSession = resolve;
  });
  await page.route(
    "**/api/v1/me",
    async (route) => {
      await sessionGate;
      await route.continue();
    },
    { times: 1 },
  );
  const documentOrigin = await page.evaluate(() => performance.timeOrigin);
  await openNavigation(page);
  await page.getByRole("link", { name: "사용 기록", exact: true }).click();
  try {
    await expect(
      page.getByRole("status", {
        name: "스튜디오를 불러오고 있습니다",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "OpenRouter로 연결" }),
    ).toHaveCount(0);
  } finally {
    releaseSession();
  }
  await expect(page.getByRole("heading", { name: "사용 기록" })).toBeVisible();
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(
    documentOrigin,
  );
  await expect(
    page
      .getByText("생성한 컷", { exact: true })
      .locator("..")
      .getByText("2", { exact: true }),
  ).toBeVisible();
  const exportEvent = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "내 데이터 내보내기", exact: true })
    .click();
  expect((await exportEvent).suggestedFilename()).toBe(
    "photo-studio-data.json",
  );
  await page.goto("/studio/presets");
  await page.getByRole("button", { name: "새 프리셋" }).click();
  await page.getByLabel("프리셋 이름", { exact: true }).fill("Synthetic brand");
  await page.getByRole("button", { name: "배경 분리" }).click();
  await page.getByRole("option", { name: "자연스럽게", exact: true }).click();
  await page.getByRole("button", { name: "프리셋 저장" }).click();
  await expect(
    page.getByRole("heading", { name: "Synthetic brand" }),
  ).toBeVisible();
  await page.goto(productUrl);
  await expect(
    page.getByRole("heading", { name: "촬영 콘셉트", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("complementary", { name: "촬영 설정 패널" })
    .getByRole("tab", { name: "기획", exact: true })
    .click();
  const personImage = page.getByRole("img", {
    name: "인물 참조 사진",
    exact: true,
  });
  await personImage.hover();
  await expect(
    page.getByRole("button", { name: "인물 참조 사진 삭제", exact: true }),
  ).toHaveCSS("opacity", "1");
  await page
    .getByRole("button", { name: "인물 참조 사진 삭제", exact: true })
    .click();
  const deletionModal = page.getByRole("dialog");
  await expect(
    deletionModal.getByText("PHOTO STUDIO / YOUR NEXT SHOT"),
  ).toHaveCount(0);
  const confirmDelete = deletionModal.getByRole("button", {
    name: "삭제",
    exact: true,
  });
  await expect(confirmDelete).toHaveCSS("background-color", "rgb(0, 245, 155)");
  await confirmDelete.click();
  await expect(personImage).toHaveCount(0);
  await openNavigation(page);
  const row = page.locator("[data-product-id]").filter({
    has: page.getByRole("link", { name: "Synthetic shirt", exact: true }),
  });
  await row.hover();
  const renameAction = row.getByRole("button", {
    name: "상품 제목 수정",
    exact: true,
  });
  await expect(renameAction).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  if (test.info().project.name === "desktop-chromium") {
    await renameAction.hover();
    await expect(renameAction).toHaveCSS(
      "background-color",
      "rgb(96, 106, 119)",
    );
  } else {
    await expect(renameAction).toBeVisible();
  }
  await row
    .getByRole("button", { name: "상품 제목 수정", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .last()
    .getByLabel("상품 제목", { exact: true })
    .fill("Renamed shirt");
  await expect(
    page.getByRole("dialog").last().getByLabel("상품 제목", { exact: true }),
  ).toHaveCSS("outline-style", "none");
  await page.getByRole("button", { name: "제목 저장", exact: true }).focus();
  await expect(
    page.getByRole("button", { name: "제목 저장", exact: true }),
  ).toHaveCSS("outline-style", "none");
  await page.getByRole("button", { name: "제목 저장", exact: true }).click();
  await expect(
    page
      .getByRole("navigation", { name: "상품 목록" })
      .getByRole("link", { name: "Renamed shirt", exact: true }),
  ).toBeVisible();
  const renamedRow = page.locator("[data-product-id]").filter({
    has: page.getByRole("link", { name: "Renamed shirt", exact: true }),
  });
  await renamedRow.hover();
  await renamedRow
    .getByRole("button", { name: "상품 삭제", exact: true })
    .click();

  await page
    .getByRole("button", { name: "상품 영구 삭제", exact: true })
    .click();
  await expect(page).toHaveURL(/\/studio$/);
  await expect(
    page.getByRole("heading", { name: "어떤 옷을 촬영할까요?", exact: true }),
  ).toBeVisible();
  await openNavigation(page);
  await expect(
    page
      .getByRole("navigation", { name: "상품 목록" })
      .getByRole("link", { name: "Synthetic shirt", exact: true }),
  ).toHaveCount(0);
  await page.goto("/studio/settings");
  for (const name of ["연결 해제", "연결 상태 확인", "OpenRouter 다시 연결"])
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(
      0,
    );
  await expect(
    page.getByRole("button", { name: "로그아웃", exact: true }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "계정과 모든 데이터 삭제" }).click();
  await page.getByLabel("계속하려면 ‘삭제’를 입력하세요.").fill("삭제");
  await page
    .getByRole("button", { name: "계정 영구 삭제", exact: true })
    .click();
  await expect(page).toHaveURL(/\/$/);
  expect(errors).toEqual([]);
  expect(unexpected).toEqual([]);
});

test("unauthenticated studio starts OAuth directly with no invitation form", async ({
  page,
}) => {
  const legacy = await page.request.get("/beta", { maxRedirects: 0 });
  expect(legacy.status()).toBe(308);
  expect(
    new URL(legacy.headers().location ?? "/invalid", appOrigin).pathname,
  ).toBe("/studio");
  if (productionOrigin) {
    let authorize: URL | undefined;
    await page.route("**/auth/openrouter/start", async (route) => {
      const response = await route.fetch({ maxRedirects: 0 });
      expect(response.status()).toBe(303);
      authorize = new URL(
        response.headers().location ?? "https://invalid.invalid",
      );
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<h1>OpenRouter authorization destination</h1>",
      });
    });
    await page.goto("/studio");
    await expect(
      page.getByRole("heading", {
        name: "OpenRouter authorization destination",
      }),
    ).toBeVisible({ timeout: 15000 });
    expect(authorize?.origin).toBe("https://openrouter.ai");
    expect(authorize?.searchParams.get("code_challenge_method")).toBe("S256");
  } else {
    await page.goto("/studio");
    await expect(
      page.getByRole("button", { name: "로컬 Mock 스튜디오 열기" }),
    ).toBeVisible();
    await expect(page.getByLabel("초대 코드")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "OpenRouter로 연결" }),
    ).toBeVisible();
  }
});
