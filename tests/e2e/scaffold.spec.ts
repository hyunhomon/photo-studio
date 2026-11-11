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
    "어떤 장면을 만들까요?",
  );
  await page.screenshot({
    path: `.tmp/workspace-home-${test.info().project.name}.png`,
    fullPage: true,
  });
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
  await expect(
    page.getByRole("heading", {
      name: "Synthetic E2E collection",
      exact: true,
    }),
  ).toBeVisible();
  await page.keyboard.press("Control+k");
  await page
    .getByRole("combobox", { name: "프로젝트 검색어" })
    .fill("Synthetic E2E");
  await expect(
    page.getByRole("option", { name: "Synthetic E2E collection" }),
  ).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "프로젝트 검색" })).toHaveCount(
    0,
  );
  await expect(page).toHaveURL(projectUrl);
  await expect(
    page.getByRole("heading", {
      name: "Synthetic E2E collection",
      exact: true,
    }),
  ).toBeVisible();
  if (test.info().project.name === "mobile-chromium") {
    await page.getByRole("button", { name: "프로젝트 목록 열기" }).click();
    await expect(
      page
        .getByRole("navigation", { name: "프로젝트 목록" })
        .getByRole("link", { name: "Synthetic E2E collection" }),
    ).toHaveAttribute("aria-current", "page");
    await page.screenshot({
      path: ".tmp/workspace-mobile-drawer.png",
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "프로젝트 목록 열기" }),
    ).toBeFocused();
  } else {
    await expect(
      page
        .getByRole("navigation", { name: "프로젝트 목록" })
        .getByRole("link", { name: "Synthetic E2E collection" }),
    ).toHaveAttribute("aria-current", "page");
    await page.getByRole("button", { name: "사이드바 접기" }).click();
    await expect(
      page.getByRole("button", { name: "사이드바 펼치기" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "사이드바 펼치기" }).click();
  }
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
  await page.getByRole("button", { name: "배경 분리", exact: true }).click();
  await page
    .getByRole("option", { name: "분리감 있게 · 멀리 있는 배경", exact: true })
    .click();
  await page.getByRole("button", { name: "콘셉트 승인", exact: true }).click();
  await expect(page.getByText("V2 · 승인됨", { exact: true })).toBeVisible();
  for (const [button, label, consent, width] of [
    [
      "인물 사진 등록",
      "인물 참조 사진 선택",
      "사진의 사용 권한과 성인 모델의 사용 동의를 확인했습니다.",
      32,
    ],
    [
      "촬영감 사진 등록",
      "촬영감 참조 사진 선택",
      "AI 참조로 사용할 권한이 있는 사진임을 확인했습니다.",
      40,
    ],
  ] as const) {
    await page.getByRole("button", { name: button, exact: true }).click();
    await page.getByLabel(label, { exact: true }).setInputFiles({
      name: "synthetic-reference.png",
      mimeType: "image/png",
      buffer: Buffer.from(syntheticPng(width, width + 16)),
    });
    await expect(
      page.getByRole("button", { name: "비공개로 사진 저장", exact: true }),
    ).toBeDisabled();
    await page.getByLabel(consent, { exact: true }).check();
    await page
      .getByRole("button", { name: "비공개로 사진 저장", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await expect(
    page.getByRole("img", { name: "인물 참조 사진", exact: true }),
  ).toHaveJSProperty("naturalWidth", 32);
  await expect(
    page.getByRole("img", { name: "촬영감 참조 사진", exact: true }),
  ).toHaveJSProperty("naturalWidth", 40);
  await page
    .getByRole("region", { name: "촬영 참조", exact: true })
    .screenshot({
      path: `.tmp/${productionOrigin ? "production-" : ""}photo-references-${test.info().project.name}.png`,
    });
  await page
    .getByRole("button", { name: "승인된 콘셉트로 생성", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "동의하고 1장 생성" }),
  ).toBeDisabled();
  await expect(
    page.getByLabel("인물 참조 사진 사용", { exact: true }),
  ).toBeChecked();
  await expect(
    page.getByLabel("촬영감 참조 사진 사용", { exact: true }),
  ).toBeChecked();
  await page.getByLabel("촬영감 참조 사진 사용", { exact: true }).uncheck();
  await page.getByRole("dialog").screenshot({
    path: `.tmp/${productionOrigin ? "production-" : ""}reference-consent-${test.info().project.name}.png`,
  });
  await page
    .getByLabel("이미지 생성 비용과 승인된 촬영 지시를 확인했습니다.")
    .check();
  await page.getByRole("button", { name: "동의하고 1장 생성" }).click();
  await waitForWorkflow(
    page.getByRole("heading", { name: "원본과 직접 확인", exact: true }),
  );
  await expect(
    page.getByRole("img", { name: "Synthetic shirt 결과 비교" }),
  ).toHaveJSProperty("naturalWidth", 64);
  await expect(
    page.getByRole("button", { name: "채택", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("상품 충실도", { exact: true })).toHaveCount(0);
  const resultsPath =
    new URL(page.url()).pathname.replace(
      "/studio/products/",
      "/api/v1/products/",
    ) + "/results";
  const firstResults = await page.request.get(
    `${productionOrigin || "http://localhost:8787"}${resultsPath}`,
  );
  const firstReferenceUsage = (await firstResults.json()).data[0];
  expect(firstReferenceUsage.personReferenceUsed).toBe(true);
  expect(firstReferenceUsage.lookReferenceUsed).toBe(false);
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: "PNG 다운로드" }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("photo-studio.png");
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
  await page
    .getByLabel("이미지 생성 비용과 승인된 촬영 지시를 확인했습니다.")
    .check();
  await page.getByRole("button", { name: "동의하고 1장 생성" }).click();
  await waitForWorkflow(
    page.getByRole("button", { name: /결과 \d+ 선택/ }).nth(1),
  );
  await expect(page.getByRole("button", { name: /결과 \d+ 선택/ })).toHaveCount(
    2,
    { timeout: 60000 },
  );
  const revisedResults = await page.request.get(
    `${productionOrigin || "http://localhost:8787"}${resultsPath}`,
  );
  const revisedReferenceUsage = (await revisedResults.json()).data[0];
  expect(revisedReferenceUsage.personReferenceUsed).toBe(true);
  expect(revisedReferenceUsage.lookReferenceUsed).toBe(true);
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
  await page
    .getByRole("heading", { name: "당신의 다음 컷." })
    .scrollIntoViewIfNeeded();
  await page.locator("#results").screenshot({
    path: `.tmp/${productionOrigin ? "production-" : ""}studio-review-${test.info().project.name}.png`,
  });
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
  if (test.info().project.name === "mobile-chromium")
    await page.getByRole("button", { name: "프로젝트 목록 열기" }).click();
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
  await expect(
    page.getByRole("heading", { name: "만들고, 고르고, 돌아보기." }),
  ).toBeVisible();
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
  await page.goto(projectUrl);
  await page
    .getByRole("button", { name: "프로젝트 삭제", exact: true })
    .click();
  await page.getByRole("button", { name: "영구 삭제", exact: true }).click();
  await expect(page).toHaveURL(/\/studio$/);
  await expect(
    page.getByRole("heading", { name: "어떤 장면을 만들까요?" }),
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
