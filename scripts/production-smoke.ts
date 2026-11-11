import { strict as assert } from "node:assert";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import production from "../infra/production.json" with { type: "json" };
const origin = `https://${production.hostname}`;
for (const requestOrigin of [origin, "https://untrusted.invalid"]) {
  const response = await fetch(`${origin}/health`, {
    headers: { Origin: requestOrigin },
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("access-control-allow-origin"),
    requestOrigin === origin ? origin : null,
  );
  const body = (await response.json()) as {
    data: { phase: number; aiMode: string };
  };
  assert.equal(body.data.phase, 5);
  assert.equal(body.data.aiMode, "openrouter");
}
assert.equal((await fetch(`${origin}/api/v1/products`)).status, 401);
const legacy = await fetch(`${origin}/beta`, { redirect: "manual" });
assert.equal(legacy.status, 308);
assert.equal(
  new URL(legacy.headers.get("location") ?? "/invalid", origin).pathname,
  "/studio",
);
assert.equal(
  (
    await fetch(`${origin}/auth/demo`, {
      method: "POST",
      headers: { Origin: origin },
    })
  ).status,
  404,
);
const output = fileURLToPath(new URL("../.tmp/production/", import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport });
    const errors: string[] = [];
    page.on("pageerror", () => errors.push("browser error"));
    await page.goto(origin);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "한 벌의 사진으로",
    );
    await page.screenshot({
      path: `${output}/landing-${viewport.width}.png`,
      fullPage: true,
    });
    await page.evaluate(() => document.fonts.ready);
    assert.equal(
      await page.evaluate(() =>
        getComputedStyle(document.body).fontFamily.includes("Pretendard"),
      ),
      true,
    );
    assert.equal(
      await page
        .getByRole("heading", { level: 1 })
        .evaluate((e) => getComputedStyle(e).fontFamily.includes("Paperlogy")),
      true,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    assert.deepEqual(errors, []);
    let authorize: URL | undefined;
    await page.route("**/auth/openrouter/start", async (route) => {
      const response = await route.fetch({ maxRedirects: 0 });
      assert.equal(response.status(), 303);
      authorize = new URL(
        response.headers().location ?? "https://invalid.invalid",
      );
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<h1>OpenRouter OAuth destination</h1>",
      });
    });
    await page.getByRole("link", { name: "사진으로 촬영 시작하기" }).click();
    await expect(
      page.getByRole("heading", { name: "OpenRouter OAuth destination" }),
    ).toBeVisible();
    assert.equal(authorize?.origin, "https://openrouter.ai");
    assert.equal(authorize?.searchParams.get("code_challenge_method"), "S256");
    await page.goto(`${origin}/studio?auth_error=OAUTH_CODE_REJECTED`);
    await expect(page.getByRole("alert")).toContainText(
      "인증 코드를 확인하지 못했습니다",
    );
    await expect(
      page.getByRole("link", { name: "OpenRouter로 연결" }),
    ).toBeVisible();
    await expect(page.getByLabel("초대 코드")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "로컬 Mock 스튜디오 열기" }),
    ).toHaveCount(0);
    await page.close();
  }
} finally {
  await browser.close();
}
console.info(
  "PASS: production HTTPS/CORS, protected API, direct no-invite PKCE redirect, callback error recovery, fonts and responsive layout. No inference.",
);
