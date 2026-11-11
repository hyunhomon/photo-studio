import { defineConfig, devices } from "@playwright/test";
const productionOrigin = process.env.PHOTO_STUDIO_PRODUCTION_ORIGIN;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: productionOrigin || "http://localhost:4321",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: productionOrigin
    ? undefined
    : [
        {
          command: "bun run dev:api",
          url: "http://localhost:8787/health",
          reuseExistingServer: !process.env.CI,
          timeout: 90000,
        },
        {
          command: "bun run dev:web",
          url: "http://localhost:4321",
          reuseExistingServer: !process.env.CI,
          timeout: 90000,
        },
      ],
});
