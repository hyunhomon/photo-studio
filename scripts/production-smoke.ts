import { strict as assert } from "node:assert";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import production from "../infra/production.json" with { type: "json" };

// Read-only deployment smoke test. Never upload an image, authenticate a
// customer, create a job, or invoke an AI adapter.
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
  assert.equal(
    ((await response.json()) as { data: { aiMode: string } }).data.aiMode,
    "mock",
  );
}
for (const path of ["/api/v1/projects", "/auth/openrouter/start"]) {
  const response = await fetch(`${origin}${path}`, {
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, 404);
  assert.equal(
    ((await response.json()) as { error: { code: string } }).error.code,
    "NOT_FOUND",
  );
}
const output = fileURLToPath(new URL("../.tmp/production/", import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ timeout: 20000 });
try {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport });
    const errors: string[] = [];
    const unexpected: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      const url = new URL(request.url());
      // cloby.co already enables Cloudflare Web Analytics at the zone level.
      // Preserve that setting; only its documented beacon is an exception.
      const cloudflareBeacon =
        (request.method() === "GET" &&
          url.origin === "https://static.cloudflareinsights.com" &&
          url.pathname.startsWith("/beacon.min.js")) ||
        (request.method() === "POST" &&
          url.origin === origin &&
          url.pathname === "/cdn-cgi/rum");
      if (
        !cloudflareBeacon &&
        (url.origin !== origin || request.method() !== "GET")
      )
        unexpected.push(`${request.method()} ${url.origin}`);
    });
    const response = await page.goto(origin);
    assert.equal(response?.status(), 200);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "옷 한 장에서",
    );
    await page.screenshot({
      path: resolve(output, `landing-${viewport.width}.png`),
      fullPage: true,
    });
    await page.getByRole("link", { name: "스튜디오 미리보기" }).click();
    await expect(
      page.getByText("프로덕션 스튜디오", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "API 연결 확인", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("API 정상");
    await page.getByRole("button", { name: "새 프로젝트" }).click();
    await expect(page.getByRole("dialog")).toContainText(
      "아직 구현되지 않았습니다",
    );
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    await page.screenshot({
      path: resolve(output, `studio-${viewport.width}.png`),
      fullPage: true,
    });
    await page.close();
  }
} finally {
  await browser.close();
}
console.info(
  "PASS: production HTTPS, API route mapping, exact-origin CORS, desktop/mobile hydration and manual health check. No provider requests; existing Cloudflare RUM beacon allowed.",
);
