import { expect, test, type Locator } from "@playwright/test";
import { syntheticPng } from "../../apps/api/test/png";

test("Mock: connect, upload, plan, generate, review, export and delete", async ({
  page,
  browser,
}) => {
  const productionOrigin = process.env.PHOTO_STUDIO_PRODUCTION_ORIGIN;
  async function waitForWorkflow(result: Locator) {
    const reconnect = page
      .getByRole("button", { name: "작업 연결 재확인", exact: true })
      .first();
    await expect(result.or(reconnect).first()).toBeVisible({ timeout: 60000 });
    if (!(await result.isVisible()) && (await reconnect.isVisible())) {
      // Reconcile the existing instance ID once; never submit a second paid job.
      await reconnect.click();
    }
    await expect(result).toBeVisible({ timeout: 60000 });
  }
  const sessions = JSON.parse(
    process.env.PHOTO_STUDIO_TEST_SESSIONS || "{}",
  ) as Record<string, { token: string }>;
  const session = sessions[test.info().project.name];
  test.setTimeout(productionOrigin ? 180000 : 90000);
  if (productionOrigin && session)
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
  const errors: string[] = [];
  const unexpected: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    const url = new URL(r.url());
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
  await page.screenshot({
    path: `.tmp/${productionOrigin ? "production-" : ""}dark-landing-${test.info().project.name}.png`,
    fullPage: true,
  });
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "옷 한 장에서",
  );
  if (productionOrigin) await page.goto("/studio");
  else {
    await page.goto("/studio");
    await page.getByRole("button", { name: "로컬 Mock 스튜디오 열기" }).click();
  }
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "나의 프로젝트",
  );
  await page.getByRole("button", { name: "새 프로젝트", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "새 프로젝트", exact: true }),
  ).toBeFocused();
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
  await expect(
    page.getByRole("img", { name: "Synthetic shirt 참조" }),
  ).toHaveJSProperty("naturalWidth", 64);
  if (productionOrigin && test.info().project.name === "desktop-chromium") {
    const other = sessions["mobile-chromium"];
    if (!other) throw new Error("Missing synthetic second user");
    const context = await browser.newContext();
    await context.addCookies([
      {
        name: "__Host-ps_session",
        value: other.token,
        url: productionOrigin,
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      },
    ]);
    const productId = new URL(page.url()).pathname.split("/").at(-1);
    expect(
      (
        await context.request.get(
          `${productionOrigin}/api/v1/products/${productId}`,
        )
      ).status(),
    ).toBe(404);
    const image = await page
      .getByRole("img", { name: "Synthetic shirt 참조" })
      .getAttribute("src");
    if (!image) throw new Error("Missing synthetic asset");
    expect((await context.request.get(image)).status()).toBe(404);
    await context.close();
  }
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
  await waitForWorkflow(
    page.getByRole("heading", { name: "촬영 콘셉트", exact: true }),
  );
  await page.getByLabel("의류 종류", { exact: true }).fill("수정한 셔츠");
  await page.getByRole("button", { name: "분석 수정 저장" }).click();
  await expect(page.getByLabel("의류 종류", { exact: true })).toHaveValue(
    "수정한 셔츠",
  );
  await page
    .getByRole("button", { name: "이 분석으로 기획 다시 만들기", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "동의하고 기획만 시작", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("기존 분석 사용과 기획 1회 비용 안내를 확인했습니다.")
    .check();
  const planningOnlyResponse = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      new URL(r.url()).pathname.endsWith("/plan"),
  );
  await page
    .getByRole("button", { name: "동의하고 기획만 시작", exact: true })
    .click();
  const planningOnly = (await (await planningOnlyResponse).json()) as {
    data: { id: string };
  };
  await waitForWorkflow(page.getByText(/V2 ·/));
  const planningJob = await page.request.get(
    `${productionOrigin || "http://localhost:8787"}/api/v1/jobs/${planningOnly.data.id}`,
  );
  expect(planningJob.ok()).toBe(true);
  const jobBody = (await planningJob.json()) as {
    data: { attempts: { stage: string }[] };
  };
  expect(jobBody.data.attempts.map((a) => a.stage)).toEqual(["planning"]);
  await expect(page.getByLabel("의류 종류", { exact: true })).toHaveValue(
    "수정한 셔츠",
  );
  await page.getByRole("button", { name: "촬영 방식", exact: true }).click();
  await page
    .getByRole("option", { name: "가상 로케이션컷", exact: true })
    .click();
  await page.getByRole("button", { name: "콘셉트 승인", exact: true }).click();
  await expect(page.getByText("V2 · 승인됨", { exact: true })).toBeVisible();
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
  await waitForWorkflow(
    page.getByText("Mock 합성 평가입니다.", { exact: false }),
  );
  await expect(
    page.getByRole("img", { name: "Synthetic shirt 결과 비교" }),
  ).toHaveJSProperty("naturalWidth", 64);
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
  await waitForWorkflow(
    page.getByRole("button", { name: /결과 \d+ 선택/ }).nth(1),
  );
  await expect(page.getByRole("button", { name: /결과 \d+ 선택/ })).toHaveCount(
    2,
    { timeout: 60000 },
  );
  await page
    .getByRole("heading", { name: "당신의 다음 컷." })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `.tmp/${productionOrigin ? "production-" : ""}studio-review-${test.info().project.name}.png`,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/studio/usage");
  await expect(
    page.getByRole("heading", { name: "만들고, 고르고, 돌아보기." }),
  ).toBeVisible();
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
    new URL(
      legacy.headers().location ?? "/invalid",
      page.url().startsWith("http")
        ? page.url()
        : process.env.PHOTO_STUDIO_PRODUCTION_ORIGIN || "http://localhost:4321",
    ).pathname,
  ).toBe("/studio");
  if (process.env.PHOTO_STUDIO_PRODUCTION_ORIGIN) {
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
    ).toBeVisible();
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
