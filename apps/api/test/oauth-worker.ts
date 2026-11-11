// Local workerd-only test entrypoint. Never imported or deployed by src/index.ts.
import { createApp } from "../src/app";
import { openRouterAdapter } from "@photo-studio/ai";
import type { Env } from "../src/env";
const app = createApp();
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    if (new URL(request.url).pathname === "/__test/provider") {
      // This entrypoint is local-only; every response comes from the local fixture server.
      const adapter = openRouterAdapter(
        "synthetic-workerd-provider-key",
        env.OPENROUTER_BASE_URL,
      );
      await adapter.preflight("synthetic/vision", "analysis");
      await adapter.preflight("synthetic/image", "generation");
      const images = ["data:image/png;base64,c3ludGhldGlj"];
      const analysis = await adapter.analyze(
        "synthetic/vision",
        images,
        "synthetic garment",
      );
      const plan = await adapter.plan(
        "synthetic/vision",
        analysis.value,
        null,
        "synthetic shoot",
      );
      const image = await adapter.generate(
        "synthetic/image",
        images,
        plan.value,
        "medium",
      );
      const quality = await adapter.evaluate(
        "synthetic/vision",
        images,
        images[0] ?? "",
        [],
      );
      return Response.json({
        ok: image.value.bytes.length > 0 && quality.value.needsHumanReview,
      });
    }
    return app.fetch(request, env, ctx);
  },
};
