import { app } from "./app";
import { cleanupIdentity } from "./auth";
import type { Env } from "./env";
import { cleanupStorage } from "./storage";
export { StudioWorkflow } from "./workflow";
export default {
  fetch: app.fetch,
  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(cleanupIdentity(env));
    ctx.waitUntil(cleanupStorage(env));
  },
};
