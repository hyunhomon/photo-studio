import { expect, test } from "bun:test";
import {
  ApiError,
  isUnauthenticated,
  request,
} from "../../apps/web/src/lib/api";

type Transport = (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) => Promise<Response>;

async function withTransport(transport: Transport, run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = Object.assign(transport, {
    preconnect: original.preconnect,
  });
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}

async function rejection(work: Promise<unknown>) {
  try {
    await work;
    throw new Error("Expected request failure");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
}

test("client requests preserve credentials, CSRF, caller abort and one mutation attempt", async () => {
  const controller = new AbortController();
  let calls = 0;
  await withTransport(
    async (_input, init) => {
      calls++;
      expect(init?.credentials).toBe("include");
      expect(init?.signal).toBe(controller.signal);
      expect(new Headers(init?.headers).get("X-CSRF-Token")).toBe(
        "synthetic-csrf",
      );
      expect(new Headers(init?.headers).get("Content-Type")).toBe(
        "application/json",
      );
      return Response.json({ data: { queued: true } });
    },
    async () => {
      expect(
        await request<{ queued: boolean }>(
          "/api/v1/synthetic",
          {
            method: "POST",
            body: "{}",
            signal: controller.signal,
          },
          "synthetic-csrf",
        ),
      ).toEqual({ queued: true });
    },
  );
  expect(calls).toBe(1);
});

test("only the application's explicit unauthorized envelope can request OAuth again", async () => {
  await withTransport(
    async () =>
      Response.json(
        {
          data: null,
          error: {
            code: "UNAUTHENTICATED",
            message: "계정을 연결해 주세요.",
          },
        },
        { status: 401 },
      ),
    async () => {
      expect(isUnauthenticated(await rejection(request("/api/v1/me")))).toBe(
        true,
      );
    },
  );
  for (const response of [
    new Response("<html>gateway error</html>", { status: 401 }),
    Response.json({ data: null }, { status: 401 }),
    Response.json(
      { error: { code: { invalid: true }, message: "invalid" } },
      { status: 401 },
    ),
  ])
    await withTransport(
      async () => response,
      async () => {
        const error = await rejection(request("/api/v1/me"));
        expect(error.code).toBe("INVALID_RESPONSE");
        expect(error.status).toBe(401);
        expect(isUnauthenticated(error)).toBe(false);
      },
    );
});

test("network failures, timeouts and cancellation are safe errors and never replay a mutation", async () => {
  for (const kind of ["network", "timeout", "cancel"] as const) {
    const controller = new AbortController();
    let calls = 0;
    await withTransport(
      async () => {
        calls++;
        if (kind !== "network")
          controller.abort(
            new DOMException(
              "synthetic-private-detail",
              kind === "timeout" ? "TimeoutError" : "AbortError",
            ),
          );
        throw kind === "network"
          ? new TypeError("synthetic-private-detail")
          : controller.signal.reason;
      },
      async () => {
        const error = await rejection(
          request("/api/v1/synthetic", {
            method: "POST",
            body: "{}",
            signal: controller.signal,
          }),
        );
        expect(error.code).toBe(
          kind === "network"
            ? "NETWORK_ERROR"
            : kind === "timeout"
              ? "REQUEST_TIMEOUT"
              : "REQUEST_CANCELLED",
        );
        expect(error.status).toBe(0);
        expect(error.message).not.toContain("synthetic-private-detail");
        expect(isUnauthenticated(error)).toBe(false);
      },
    );
    expect(calls).toBe(1);
  }
});

test("malformed successful envelopes and proxy errors never expose parser or upstream content", async () => {
  for (const response of [
    new Response("<html>synthetic-private-detail</html>", { status: 502 }),
    Response.json(null),
    Response.json([]),
    Response.json({ unexpected: true }),
    Response.json({ error: { code: "BAD", message: { invalid: true } } }),
  ])
    await withTransport(
      async () => response,
      async () => {
        const error = await rejection(request("/api/v1/synthetic"));
        expect(error.code).toBe("INVALID_RESPONSE");
        expect(error.message).not.toContain("synthetic-private-detail");
        expect(error.message).not.toContain("JSON");
      },
    );
});
