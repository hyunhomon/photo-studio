import { expect, test } from "@playwright/test";

test("landing → studio, honest empty state, accessible modal and live API health", async ({
  page,
}) => {
  const errors: string[] = [];
  const unexpectedRequests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!["localhost", "127.0.0.1"].includes(url.hostname))
      unexpectedRequests.push(url.hostname);
    if (request.method() !== "GET") unexpectedRequests.push(request.method());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "옷 한 장에서",
  );
  await page.getByRole("link", { name: "스튜디오 미리보기" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "나의 프로젝트",
  );
  await expect(
    page.getByText("프로젝트 저장과 이미지 업로드는 아직 지원하지 않습니다.", {
      exact: false,
    }),
  ).toBeVisible();
  const create = page.getByRole("button", { name: "새 프로젝트" });
  await create.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("사용자 본인의 OpenRouter 크레딧");
  await expect(dialog).toContainText("아직 구현되지 않았습니다");
  for (let tab = 0; tab < 4; tab++) {
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() =>
        Boolean(document.activeElement?.closest('[role="dialog"]')),
      ),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(create).toBeFocused();
  await page.getByRole("button", { name: "로컬 API 연결 확인" }).click();
  await expect(page.getByRole("status")).toContainText("API 정상");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  expect(unexpectedRequests).toEqual([]);
});

test("API unavailable state remains recoverable", async ({ page }) => {
  await page.goto("/studio");
  await page.route("http://localhost:8787/health", (route) => route.abort());
  const check = page.getByRole("button", { name: "로컬 API 연결 확인" });
  await check.click();
  await expect(page.getByRole("status")).toContainText(
    "API에 연결할 수 없습니다",
  );
  await page.unroute("http://localhost:8787/health");
  await check.click();
  await expect(page.getByRole("status")).toContainText("API 정상");
});
