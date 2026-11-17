import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testMatch: "**/upload-compatibility.spec.ts",
  outputDir: process.env.PHOTO_STUDIO_PRODUCTION_ORIGIN
    ? "test-results/production-safari"
    : "test-results/local-safari",
  projects: [{ name: "mobile-webkit", use: { ...devices["iPhone 13"] } }],
});
