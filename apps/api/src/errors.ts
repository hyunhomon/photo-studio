import { HTTPException } from "hono/http-exception";

export class AppError extends HTTPException {
  constructor(
    public code: string,
    message: string,
    status: 400 | 401 | 403 | 404 | 409 | 413 | 429 | 500 | 502 | 503 = 400,
  ) {
    super(status, { message });
  }
}
export const notFound = () =>
  new AppError("NOT_FOUND", "요청한 자료를 찾을 수 없습니다.", 404);
