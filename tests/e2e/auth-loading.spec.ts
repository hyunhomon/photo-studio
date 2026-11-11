import { expect, test } from "@playwright/test";

test("session pending and temporary server failures never show a disconnected account", async ({
  page,
}) => {
  test.setTimeout(90000);
  for (const path of [
    "/studio",
    "/studio/presets",
    "/studio/usage",
    "/studio/settings",
  ]) {
    let release: () => void = () => {};
    let calls = 0;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/v1/me", async (route) => {
      calls++;
      await gate;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          data: null,
          error: {
            code: "TEMPORARY_FAILURE",
            message: "일시적으로 요청을 처리할 수 없습니다.",
          },
        }),
      });
    });
    await page.goto(path);
    try {
      await expect(
        page.getByRole("status", {
          name: "스튜디오를 불러오고 있습니다",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "OpenRouter로 연결", exact: true }),
      ).toHaveCount(0);
      if (path === "/studio")
        await page.screenshot({
          path: `.tmp/workspace-pending-${test.info().project.name}.png`,
          fullPage: true,
        });
    } finally {
      release();
    }
    await expect(
      page.getByRole("heading", { name: "스튜디오에 잠시 연결할 수 없어요." }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "OpenRouter로 연결", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "다시 확인", exact: true }).click();
    await expect.poll(() => calls).toBe(2);
    await expect(
      page.getByRole("heading", { name: "스튜디오에 잠시 연결할 수 없어요." }),
    ).toBeVisible();
    await page.unroute("**/api/v1/me");
  }
});
