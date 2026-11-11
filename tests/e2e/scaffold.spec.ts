import { expect, test } from "@playwright/test";
import { syntheticPng } from "../../apps/api/test/png";

test("local Mock: connect, create project, secure upload, preset, delete and logout", async ({
  page,
}) => {
  test.setTimeout(90000);
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
  await page.getByRole("button", { name: "분석 시작", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "동의하고 분석·기획 시작" }),
  ).toBeDisabled();
  await page
    .getByLabel("사진 전송과 분석·기획 비용 안내를 확인했습니다.")
    .check();
  await page.getByRole("button", { name: "동의하고 분석·기획 시작" }).click();
  await expect(
    page.getByRole("heading", { name: "촬영 콘셉트", exact: true }),
  ).toBeVisible({ timeout: 60000 });
  await page.getByLabel("의류 종류", { exact: true }).fill("수정한 셔츠");
  await page.getByRole("button", { name: "분석 수정 저장" }).click();
  await expect(page.getByLabel("의류 종류", { exact: true })).toHaveValue(
    "수정한 셔츠",
  );
  await page.getByRole("button", { name: "촬영 방식", exact: true }).click();
  await page
    .getByRole("option", { name: "가상 로케이션컷", exact: true })
    .click();
  await page.getByRole("button", { name: "콘셉트 승인", exact: true }).click();
  await expect(page.getByText("V1 · 승인됨", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "승인된 콘셉트로 생성", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "동의하고 1장 생성" }),
  ).toBeDisabled();
  await page
    .getByLabel("이미지 생성·평가 비용과 승인된 콘셉트를 확인했습니다.")
    .check();
  await page.getByRole("button", { name: "동의하고 1장 생성" }).click();
  await expect(
    page.getByText("Mock 합성 평가입니다.", { exact: false }),
  ).toBeVisible({ timeout: 60000 });
  await page.getByRole("button", { name: "채택", exact: true }).click();
  await expect(page.getByText("✓ 채택한 컷", { exact: true })).toBeVisible();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: "PNG 다운로드" }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("photo-studio.png");
  await page.getByRole("button", { name: "폐기", exact: true }).click();
  await page.getByRole("button", { name: "폐기 사유", exact: true }).click();
  await page.getByRole("option", { name: "로고·텍스트가 왜곡됐어요" }).click();
  await page.getByLabel("추가 메모 (선택)").fill("Synthetic review");
  await page
    .getByRole("button", { name: "폐기 사유 저장", exact: true })
    .click();
  await expect(
    page.getByText("폐기한 컷 · 로고·텍스트가 왜곡됐어요", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "사유를 남기고 재생성" }).click();
  await page
    .getByLabel("이미지 생성·평가 비용과 승인된 콘셉트를 확인했습니다.")
    .check();
  await page.getByRole("button", { name: "동의하고 1장 생성" }).click();
  await expect(page.getByRole("button", { name: /결과 \d+ 선택/ })).toHaveCount(
    2,
    { timeout: 60000 },
  );
  await page
    .getByRole("heading", { name: "당신의 다음 컷." })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `.tmp/studio-review-${test.info().project.name}.png`,
  });
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
