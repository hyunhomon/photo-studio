import { expect, test } from "@playwright/test";

test("marketing: honest interactive product demo, imagery, FAQ and responsive layout", async ({
  page,
}) => {
  const errors: string[] = [],
    execution: string[] = [];
  page.on("pageerror", (error) => errors.push(error.name));
  page.on("request", (request) => {
    if (/\/(api|auth)\//.test(new URL(request.url()).pathname))
      execution.push(request.method());
  });
  await page.goto("/");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
  await expect(page.locator("html")).toHaveCSS(
    "background-color",
    "rgb(11, 12, 14)",
  );
  const primary = page.getByRole("link", {
    name: "사진으로 촬영 시작하기",
    exact: true,
  });
  await expect(primary).toHaveCSS("background-color", "rgb(0, 245, 155)");
  await expect(primary).toHaveCSS("color", "rgb(4, 20, 13)");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /상품 사진에서,\s*다음 촬영까지\./,
  );
  await expect(
    page.getByText(
      "별도 제작한 데모 이미지이며 실제 서비스 생성 결과가 아닙니다.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.locator(".landing-orbit-card,.light-study")).toHaveCount(0);
  const demo = page.locator(".landing-product-demo");
  await expect(
    demo.getByRole("tab", { name: "촬영 설계", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await demo.getByRole("button", { name: "버드아이", exact: true }).click();
  await expect(demo.getByRole("status")).toContainText("버드아이");
  await demo.getByRole("button", { name: "전신", exact: true }).click();
  await expect(demo.getByRole("status")).toContainText("전신 프레임");
  await demo.getByRole("tab", { name: "사진 준비", exact: true }).click();
  await expect(
    demo.getByText("정면·후면·디테일, 최대 3장", { exact: true }),
  ).toBeVisible();
  await demo
    .getByRole("button", { name: "촬영 설계 살펴보기", exact: true })
    .click();
  await demo
    .getByRole("button", { name: "비교·개선 살펴보기", exact: true })
    .click();
  await demo.getByRole("button", { name: "빛과 초점", exact: true }).click();
  await expect(
    demo.getByRole("button", { name: "빛과 초점", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await demo.getByLabel("수정 지시").fill("Synthetic demo direction");
  await expect(demo.getByLabel("수정 지시")).toHaveValue(
    "Synthetic demo direction",
  );
  await demo
    .getByRole("button", { name: "가까운 프레임", exact: true })
    .click();
  await expect(
    demo.getByRole("img", {
      name: "데모용 성인 모델의 패션 촬영 장면",
      exact: true,
    }),
  ).toHaveAttribute("src", "/landing/demo-detail.webp");
  const expand = demo.getByRole("button", {
    name: "촬영 장면 예시 확대",
    exact: true,
  });
  await expand.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("img", {
      name: "확대한 데모용 패션 촬영 장면",
      exact: true,
    }),
  ).toHaveJSProperty("naturalWidth", 512);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(expand).toBeFocused();
  const question = page
    .locator("summary")
    .filter({ hasText: "사진을 올리면 바로 생성되나요?" });
  await question.click();
  await expect(
    page.getByText(/아니요. 업로드만으로 AI를 호출하지 않아요/),
  ).toBeVisible();
  for (const link of await page.locator('a[href^="#"]').all()) {
    const target = await link.getAttribute("href");
    if (target) await expect(page.locator(target)).toHaveCount(1);
  }
  for (const path of [
    "demo-garment.webp",
    "demo-shoot.webp",
    "demo-detail.webp",
  ]) {
    const response = await page.request.get(`/landing/${path}`);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/webp");
    expect((await response.body()).length).toBeLessThan(100000);
  }
  for (const width of test.info().project.name === "desktop-chromium"
    ? [1440, 1024, 768]
    : [390, 360]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  expect(execution).toEqual([]);
  expect(errors).toEqual([]);
});
