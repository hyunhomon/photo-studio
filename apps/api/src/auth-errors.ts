export class OAuthError extends Error {
  constructor(
    public code: string,
    public httpStatus: number | null = null,
  ) {
    super(code);
  }
}
