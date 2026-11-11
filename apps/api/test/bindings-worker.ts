// Test-only entrypoint. Production wrangler.jsonc points to src/index.ts and
// cannot expose these infrastructure probes to app users.
import { createDb, sql } from "@photo-studio/db";
import { app } from "../src/app";

export { StudioWorkflow } from "../src/workflow";

export default {
  async fetch(request: Request, env: CloudflareBindings) {
    const path = new URL(request.url).pathname;
    if (path === "/__test/bindings" && request.method === "POST") {
      const row = await createDb(env.DB).get<{ value: number }>(
        sql`select 1 as value`,
      );
      const key = "scaffold/synthetic-probe.txt";
      try {
        await env.ASSETS.put(key, "synthetic fixture");
        const object = await env.ASSETS.get(key);
        return Response.json({
          d1: row?.value === 1,
          r2: (await object?.text()) === "synthetic fixture",
        });
      } finally {
        await env.ASSETS.delete(key);
      }
    }
    if (path === "/__test/workflow" && request.method === "POST") {
      const instance = await env.STUDIO_WORKFLOW.create({
        params: { kind: "scaffold-smoke" },
      });
      return Response.json({ id: instance.id });
    }
    if (path.startsWith("/__test/workflow/") && request.method === "GET") {
      const instance = await env.STUDIO_WORKFLOW.get(
        path.split("/").at(-1) ?? "",
      );
      return Response.json(await instance.status());
    }
    return app.fetch(request, env);
  },
};
