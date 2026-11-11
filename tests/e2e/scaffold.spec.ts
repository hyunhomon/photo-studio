import { expect, test } from "@playwright/test";
import { syntheticPng } from "../../apps/api/test/png";

test("local Mock: connect, create project, secure upload, preset, delete and logout", async ({
  page,
}) => {
  const errors: string[] = [];
  const unexpected: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (!["localhost", "127.0.0.1"].includes(new URL(r.url()).hostname))
      unexpected.push("off-origin request");
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "옷 한 장에서",
  );
  await page.goto("/beta");
  await page.getByRole("button", { name: "로컬 Mock 스튜디오 열기" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "나의 프로젝트",
  );
  await page.getByRole("button", { name: "새 프로젝트", exact: true }).click();
  await page
    .getByLabel("프로젝트 이름", { exact: true })
    .fill("Synthetic E2E collection");
  await page
    .getByRole("button", { name: "프로젝트 만들기", exact: true })
    .click();
  await expect(page).toHaveURL(/\/studio\/projects\//);
  const projectUrl = page.url();
  await page.getByRole("button", { name: "상품 등록", exact: true }).click();
  await page.getByLabel("상품 이름", { exact: true }).fill("Synthetic shirt");
  await page.getByLabel("상품 사진", { exact: true }).setInputFiles({
    name: "fixture.png",
    mimeType: "image/png",
    buffer: Buffer.from(syntheticPng()),
  });
  await page.getByRole("button", { name: "비공개로 상품 등록" }).click();
  await expect(page).toHaveURL(/\/studio\/products\//);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Synthetic shirt",
  );
  await expect(
    page.getByRole("img", { name: "Synthetic shirt 참조" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/studio/presets");
  await page.getByRole("button", { name: "새 프리셋" }).click();
  await page.getByLabel("프리셋 이름", { exact: true }).fill("Synthetic brand");
  await page.getByRole("button", { name: "촬영 모드" }).click();
  await page.getByRole("option", { name: "모델 · 가상 로케이션" }).click();
  await page.getByRole("button", { name: "프리셋 저장" }).click();
  await expect(
    page.getByRole("heading", { name: "Synthetic brand" }),
  ).toBeVisible();
  await page.goto(projectUrl);
  await page
    .getByRole("button", { name: "프로젝트 삭제", exact: true })
    .click();
  await page.getByRole("button", { name: "영구 삭제", exact: true }).click();
  await expect(page).toHaveURL(/\/studio$/);
  await expect(
    page.getByRole("heading", { name: "첫 번째 컬렉션을 기다리고 있어요." }),
  ).toBeVisible();
  await page.goto("/studio/settings");
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page).toHaveURL(/\/beta$/);
  expect(errors).toEqual([]);
  expect(unexpected).toEqual([]);
});

test("unauthenticated studio returns to connection screen", async ({
  page,
}) => {
  await page.goto("/studio");
  await expect(page).toHaveURL(/\/beta$/);
  await expect(
    page.getByRole("button", { name: "OpenRouter로 연결" }),
  ).toBeDisabled();
});
