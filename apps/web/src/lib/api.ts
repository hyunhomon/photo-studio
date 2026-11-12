export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export const apiBase =
  import.meta.env.PUBLIC_API_URL || "http://localhost:8787";

export function isUnauthenticated(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    error.status === 401 &&
    error.code === "UNAUTHENTICATED"
  );
}

function transportError(error: unknown, signal: AbortSignal) {
  const reason = signal.aborted ? signal.reason : error;
  if (reason instanceof Error && reason.name === "TimeoutError")
    return new ApiError(
      "REQUEST_TIMEOUT",
      "응답을 기다리는 시간이 길어졌습니다. 새로고침해 작업 상태를 확인해 주세요.",
      0,
    );
  if (signal.aborted)
    return new ApiError("REQUEST_CANCELLED", "요청을 취소했습니다.", 0);
  return new ApiError(
    "NETWORK_ERROR",
    "서버에 연결할 수 없습니다. 잠시 후 작업 상태를 확인해 주세요.",
    0,
  );
}

const invalidResponse = (status: number) =>
  new ApiError(
    "INVALID_RESPONSE",
    "서버 응답을 확인하지 못했습니다. 새로고침해 작업 상태를 확인해 주세요.",
    status,
  );

export async function request<T>(
  path: string,
  options: RequestInit = {},
  csrf?: string,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  if (csrf) headers.set("X-CSRF-Token", csrf);
  const signal = options.signal ?? AbortSignal.timeout(30000);
  let response: Response;
  try {
    response = await fetch(new URL(path, apiBase), {
      ...options,
      headers,
      credentials: "include",
      signal,
    });
  } catch (error) {
    // A mutation may already have reached the server. Never replay it here.
    throw transportError(error, signal);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (signal.aborted) throw transportError(error, signal);
    throw invalidResponse(response.status);
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw invalidResponse(response.status);
  const envelope = body as {
    data?: T;
    error?: { code?: unknown; message?: unknown } | null;
  };
  if (envelope.error) {
    const code = envelope.error.code;
    const message = envelope.error.message;
    if (
      typeof code !== "string" ||
      !/^[A-Z][A-Z0-9_]{0,99}$/.test(code) ||
      typeof message !== "string" ||
      !message.trim() ||
      message.length > 800
    )
      throw invalidResponse(response.status);
    throw new ApiError(code, message, response.status);
  }
  if (!response.ok || !Object.hasOwn(envelope, "data"))
    throw invalidResponse(response.status);
  return envelope.data as T;
}
export interface Me {
  csrf: string;
  connected: boolean;
  mode: "mock" | "openrouter";
  deleting: boolean;
  models: { analysis: string; image: string };
}
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
