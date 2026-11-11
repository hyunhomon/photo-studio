import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  output: "server",
  // Application sessions belong to the API Worker/D1 in Phase 1.
  session: false,
  adapter: cloudflare({
    imageService: "passthrough",
    ...(process.env.PHOTO_STUDIO_WRANGLER_CONFIG
      ? { configPath: process.env.PHOTO_STUDIO_WRANGLER_CONFIG }
      : {}),
  }),
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },
  devToolbar: { enabled: false },
});
