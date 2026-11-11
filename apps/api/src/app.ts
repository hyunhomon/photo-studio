import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import { ZodError } from "zod";
import { and, connections, createDb, eq, isNull } from "@photo-studio/db";
import type { AppContext } from "./env";
import {
  authRoutes,
  type AuthDeps,
  demoAllowed,
  requireCsrf,
  requireIdentity,
  webOrigin,
} from "./auth";
import { AppError } from "./errors";
import { decrypt } from "./crypto";
import { resourceRoutes, type ResourceDeps } from "./resources";
import { cancelProducts, pipelineRoutes } from "./pipeline";
import { generationRoutes } from "./generation";
import { operationsRoutes } from "./operations";

export function createApp(deps: AuthDeps & ResourceDeps = {}) {
  const app = new Hono<AppContext>();
  app.use("*", (c, next) =>
    secureHeaders({
      crossOriginResourcePolicy:
        c.env.APP_ENV === "local" ? "same-site" : "same-origin",
    })(c, next),
  );
  app.use("*", async (c, next) => {
    const allowed = c.env.ALLOWED_WEB_ORIGINS.split(",").map((origin) =>
      origin.trim(),
    );
    return cors({
      origin: (origin) => (allowed.includes(origin) ? origin : undefined),
      credentials: true,
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "X-CSRF-Token"],
    })(c, next);
  });
  app.use(
    "*",
    bodyLimit({
      maxSize: 32 * 1024 * 1024,
      onError: (c) =>
        c.json(
          {
            data: null,
            error: {
              code: "REQUEST_TOO_LARGE",
              message: "요청 크기가 너무 큽니다.",
            },
          },
          413,
        ),
    }),
  );
  app.get("/health", (c) =>
    c.json({
      data: {
        status: "ok",
        service: "photo-studio-api",
        phase: 5,
        aiMode: c.env.AI_MODE,
      },
    }),
  );
  app.route("/auth", authRoutes(deps));
  app.get("/api/v1/config", (c) =>
    c.json({
      data: { demoAllowed: demoAllowed(c.env), webOrigin: webOrigin(c.env) },
    }),
  );
  app.use("/api/v1/*", async (c, next) => {
    const identity = await requireIdentity(c);
    if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method))
      requireCsrf(c, identity);
    c.header("Cache-Control", "private, no-store");
    await next();
  });
  app.get("/api/v1/me", async (c) => {
    const identity = c.get("identity");
    const connection = await createDb(c.env.DB)
      .select({ provider: connections.provider })
      .from(connections)
      .where(
        and(
          eq(connections.userId, identity.userId),
          isNull(connections.revokedAt),
        ),
      )
      .get();
    return c.json({
      data: {
        csrf: identity.csrf,
        connected: Boolean(connection),
        mode: identity.isTest ? "mock" : "openrouter",
        deleting: identity.status !== "active",
        models: {
          analysis: identity.isTest
            ? "Mock 분석·기획"
            : c.env.OPENROUTER_ANALYSIS_MODEL,
          image: identity.isTest
            ? "Mock 원본 복사"
            : c.env.OPENROUTER_IMAGE_MODEL,
          evaluation: identity.isTest
            ? "Mock 합성 평가"
            : c.env.OPENROUTER_EVALUATION_MODEL,
        },
      },
    });
  });
  app.get("/api/v1/connection/status", async (c) => {
    const identity = c.get("identity");
    const connection = await createDb(c.env.DB)
      .select()
      .from(connections)
      .where(
        and(
          eq(connections.userId, identity.userId),
          isNull(connections.revokedAt),
        ),
      )
      .get();
    if (!connection)
      throw new AppError(
        "PROVIDER_NOT_CONNECTED",
        "OpenRouter를 다시 연결해 주세요.",
        409,
      );
    if (identity.isTest) return c.json({ data: { status: "mock" } });
    const key = await decrypt(
      connection.keyEnvelope,
      `provider:${identity.userId}`,
      c.env,
    );
    let response: Response;
    try {
      response = await fetch(`${c.env.OPENROUTER_BASE_URL}/key`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(10000),
        redirect: "error",
      });
    } catch {
      throw new AppError(
        "PROVIDER_UNAVAILABLE",
        "OpenRouter에 연결할 수 없습니다. 잠시 후 다시 확인해 주세요.",
        503,
      );
    }
    if (response.status === 401 || response.status === 403)
      throw new AppError(
        "PROVIDER_KEY_INVALID",
        "연결 키가 만료되거나 폐기됐습니다. OpenRouter를 다시 연결해 주세요.",
        409,
      );
    if (response.status === 402)
      throw new AppError(
        "INSUFFICIENT_PROVIDER_CREDIT",
        "OpenRouter 크레딧이나 키 사용 한도를 확인해 주세요.",
        409,
      );
    if (response.status === 429)
      throw new AppError(
        "PROVIDER_RATE_LIMITED",
        "OpenRouter 요청 한도에 도달했습니다. 잠시 후 다시 확인해 주세요.",
        429,
      );
    if (!response.ok)
      throw new AppError(
        "PROVIDER_UNAVAILABLE",
        "OpenRouter가 응답하지 않습니다. 잠시 후 다시 확인해 주세요.",
        503,
      );
    const body = (await response.json()) as {
      data?: { limit_remaining?: number | null };
    };
    return c.json({
      data: {
        status:
          typeof body.data?.limit_remaining === "number" &&
          body.data.limit_remaining <= 0
            ? "no_credit"
            : "ready",
      },
    });
  });
  app.route(
    "/api/v1",
    resourceRoutes({ beforeDelete: cancelProducts, ...deps }),
  );
  app.route("/api/v1", pipelineRoutes());
  app.route("/api/v1", generationRoutes());
  app.route("/api/v1", operationsRoutes());
  app.notFound((c) =>
    c.json(
      {
        data: null,
        error: {
          code: "NOT_FOUND",
          message: "요청한 기능을 찾을 수 없습니다.",
        },
      },
      404,
    ),
  );
  app.onError((error, c) => {
    if (error instanceof AppError)
      return c.json(
        { data: null, error: { code: error.code, message: error.message } },
        error.status,
      );
    if (error instanceof ZodError || error instanceof SyntaxError)
      return c.json(
        {
          data: null,
          error: {
            code: "VALIDATION_ERROR",
            message: "입력 내용을 확인해 주세요.",
          },
        },
        400,
      );
    return c.json(
      {
        data: null,
        error: {
          code: "INTERNAL_ERROR",
          message: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        },
      },
      500,
    );
  });
  return app;
}
export const app = createApp();
