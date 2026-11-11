import { healthSchema } from "@photo-studio/schemas";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";

export const app = new Hono<{ Bindings: CloudflareBindings }>();

app.use("*", secureHeaders());
app.use("*", async (c, next) => {
  const allowed = c.env.ALLOWED_WEB_ORIGINS.split(",").map((origin) =>
    origin.trim(),
  );
  return cors({
    origin: (origin) => (allowed.includes(origin) ? origin : undefined),
    credentials: true,
    allowMethods: ["GET", "OPTIONS"],
  })(c, next);
});

// Liveness only: does not imply database, authentication or AI readiness.
app.get("/health", (c) =>
  c.json(
    healthSchema.parse({
      data: {
        status: "ok",
        service: "photo-studio-api",
        phase: 0,
        aiMode: "mock",
      },
    }),
  ),
);

app.notFound((c) =>
  c.json(
    {
      data: null,
      error: { code: "NOT_FOUND", message: "요청한 기능을 찾을 수 없습니다." },
    },
    404,
  ),
);
// Do not dump upstream messages, URLs, request bodies or credentials to logs.
app.onError((_error, c) =>
  c.json(
    {
      data: null,
      error: { code: "INTERNAL_ERROR", message: "요청을 처리하지 못했습니다." },
    },
    500,
  ),
);
