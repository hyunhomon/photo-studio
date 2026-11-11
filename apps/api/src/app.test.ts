import { describe, expect, test } from "bun:test";
import { healthSchema } from "@photo-studio/schemas";
import { app } from "./app";

const env = {
  ALLOWED_WEB_ORIGINS: "http://localhost:4321",
  AI_MODE: "mock",
} as CloudflareBindings;

describe("API scaffold", () => {
  test("health works without credentials or database access", async () => {
    const response = await app.request("/health", {}, env);
    expect(response.status).toBe(200);
    expect(healthSchema.parse(await response.json()).data.aiMode).toBe("mock");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
  test("only the exact web origin receives credentialed CORS access", async () => {
    for (const origin of [
      "http://localhost:4321",
      "https://untrusted.invalid",
      "http://localhost:4321.evil.invalid",
    ]) {
      const response = await app.request(
        "/health",
        { headers: { Origin: origin } },
        env,
      );
      expect(response.headers.get("access-control-allow-origin")).toBe(
        origin === env.ALLOWED_WEB_ORIGINS ? origin : null,
      );
    }
  });
  test("protects private routes and has no public test backdoor", async () => {
    for (const path of ["/api/v1/projects", "/__test/bindings"]) {
      const response = await app.request(path, {}, env);
      expect(response.status).toBe(path.startsWith("/api/v1/") ? 401 : 404);
      expect(await response.json()).toMatchObject({
        data: null,
        error: {
          code: path.startsWith("/api/v1/") ? "UNAUTHENTICATED" : "NOT_FOUND",
        },
      });
    }
  });
});
