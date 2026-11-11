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
export async function request<T>(
  path: string,
  options: RequestInit = {},
  csrf?: string,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  if (csrf) headers.set("X-CSRF-Token", csrf);
  const response = await fetch(new URL(path, apiBase), {
    ...options,
    headers,
    credentials: "include",
    signal: options.signal ?? AbortSignal.timeout(30000),
  });
  const body = (await response.json()) as {
    data: T;
    error?: { code: string; message: string };
  };
  if (!response.ok || body.error)
    throw new ApiError(
      body.error?.code ?? "NETWORK_ERROR",
      body.error?.message ?? "연결을 확인하고 다시 시도해 주세요.",
      response.status,
    );
  return body.data;
}
export interface Me {
  csrf: string;
  connected: boolean;
  mode: "mock" | "openrouter";
  deleting: boolean;
  models: { analysis: string; image: string; evaluation: string };
}
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
