// Local workerd-only test entrypoint. Never imported or deployed by src/index.ts.
import { createApp } from "../src/app";
const app = createApp({
  exchange: async () => ({
    key: "synthetic-workerd-provider-key",
    user_id: "synthetic-workerd-account",
  }),
});
export default { fetch: app.fetch };
