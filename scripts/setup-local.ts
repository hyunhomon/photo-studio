import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const root = resolve(import.meta.dir, "..");
const vars = resolve(root, "apps/api/.dev.vars");
let content = (await Bun.file(vars).exists())
  ? await readFile(vars, "utf8")
  : "";
if (!/^APP_ENCRYPTION_KEY_B64=/m.test(content)) {
  const key = crypto.getRandomValues(new Uint8Array(32));
  content += `\nAPP_ENCRYPTION_KEY_B64=${btoa(String.fromCharCode(...key))}\n`;
  await writeFile(vars, content);
}
const child = Bun.spawn(
  [
    "node",
    resolve(root, "apps/api/node_modules/wrangler/bin/wrangler.js"),
    "d1",
    "migrations",
    "apply",
    "photo-studio-local",
    "--local",
    "--config",
    resolve(root, "apps/api/wrangler.jsonc"),
  ],
  {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  },
);
await Promise.all([
  new Response(child.stdout).text(),
  new Response(child.stderr).text(),
]);
if (await child.exited) throw new Error("Local database migrations failed.");
console.info("Local encrypted-key configuration and database schema ready.");
