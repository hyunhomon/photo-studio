import { Database } from "bun:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Env } from "../src/env";

// D1's prepared statement shape over real SQLite, with atomic batch behavior.
// workerd integration separately verifies the actual Cloudflare bindings.
export function memoryEnv() {
  const sqlite = new Database(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const dir = resolve(import.meta.dir, "../../../packages/db/migrations");
  for (const name of readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort())
    sqlite.exec(readFileSync(resolve(dir, name), "utf8"));
  const statement = (sql: string, values: unknown[] = []) => ({
    bind: (...next: unknown[]) => statement(sql, next),
    async first(column?: string) {
      const row = sqlite.query(sql).get(...(values as [])) as Record<
        string,
        unknown
      > | null;
      return column ? (row?.[column] ?? null) : row;
    },
    async all() {
      return {
        success: true,
        results: sqlite.query(sql).all(...(values as [])),
        meta: { changes: 0 },
      };
    },
    async raw() {
      return sqlite.query(sql).values(...(values as []));
    },
    async run() {
      const result = sqlite.query(sql).run(...(values as []));
      return {
        success: true,
        results: [],
        meta: {
          changes: result.changes,
          last_row_id: Number(result.lastInsertRowid),
        },
      };
    },
    executeSync() {
      if (/^\s*SELECT\b/i.test(sql))
        return {
          success: true,
          results: sqlite.query(sql).all(...(values as [])),
          meta: { changes: 0 },
        };
      const result = sqlite.query(sql).run(...(values as []));
      return { success: true, results: [], meta: { changes: result.changes } };
    },
  });
  const db = {
    prepare: (sql: string) => statement(sql),
    batch: async (statements: ReturnType<typeof statement>[]) =>
      sqlite.transaction(() => statements.map((s) => s.executeSync()))(),
    exec: async (sql: string) => {
      sqlite.exec(sql);
      return { count: 1, duration: 0 };
    },
  } as unknown as D1Database;
  const objects = new Map<string, { bytes: Uint8Array; type: string }>();
  const r2 = {
    async list(options: { prefix?: string }) {
      return {
        objects: [...objects.keys()]
          .filter((key) => key.startsWith(options.prefix ?? ""))
          .map((key) => ({ key })),
        truncated: false,
      };
    },
    async put(
      key: string,
      value: Uint8Array | ArrayBuffer,
      options?: { httpMetadata?: { contentType?: string } },
    ) {
      objects.set(key, {
        bytes: new Uint8Array(value).slice(),
        type: options?.httpMetadata?.contentType ?? "application/octet-stream",
      });
      return {};
    },
    async get(key: string) {
      const value = objects.get(key);
      if (!value) return null;
      return {
        body: new Blob([new Uint8Array(value.bytes).buffer]).stream(),
        size: value.bytes.length,
        arrayBuffer: async () => value.bytes.slice().buffer,
        httpMetadata: { contentType: value.type },
        writeHttpMetadata: (headers: Headers) =>
          headers.set("Content-Type", value.type),
      };
    },
    async delete(keys: string | string[]) {
      for (const key of typeof keys === "string" ? [keys] : keys)
        objects.delete(key);
    },
  } as unknown as R2Bucket;
  const workflows: { id: string; params: unknown }[] = [];
  const env: Env = {
    DB: db,
    ASSETS: r2,
    STUDIO_WORKFLOW: {
      create: async (options: { id: string; params: unknown }) => {
        workflows.push(options);
        return { id: options.id };
      },
    } as unknown as Env["STUDIO_WORKFLOW"],
    APP_ENV: "local",
    ENABLE_DEMO: "true",
    AI_MODE: "mock",
    ALLOWED_WEB_ORIGINS: "http://localhost:4321",
    APP_ENCRYPTION_KEY_B64: btoa(
      String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
    ),
    APP_ENCRYPTION_KEY_VERSION: "v1",
    OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
    OPENROUTER_CALLBACK_URL: "http://localhost:8787/auth/openrouter/callback",
    OPENROUTER_IMAGE_MODEL: "openai/gpt-image-2",
    OPENROUTER_ANALYSIS_MODEL: "",
    OPENROUTER_EVALUATION_MODEL: "",
  };
  return { env, sqlite, objects, workflows };
}
