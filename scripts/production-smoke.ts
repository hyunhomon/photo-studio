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
assert.equal((await fetch(`${origin}/api/v1/projects`)).status, 401);
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
      "옷 한 장에서",
    );
    await page.screenshot({
      path: `${output}/landing-${viewport.width}.png`,
      fullPage: true,
    });
    await page.getByRole("link", { name: "초대 베타 시작하기" }).click();
    await expect(page).toHaveURL(/\/beta$/);
    await expect(
      page.getByRole("button", { name: "로컬 Mock 스튜디오 열기" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "OpenRouter로 연결" }),
    ).toBeDisabled();
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
    await page.screenshot({
      path: `${output}/beta-${viewport.width}.png`,
      fullPage: true,
    });
    await page.close();
  }
} finally {
  await browser.close();
}
console.info(
  "PASS: production HTTPS, exact CORS, protected API, disabled test login, invite UI, self-hosted fonts and responsive layout. No inference.",
);
