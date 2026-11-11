import type { Env } from "./env";
import { AppError } from "./errors";

export function randomToken(bytes = 32) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...data))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
export async function hash(value: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
export async function challenge(verifier: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
async function importKey(value?: string) {
  try {
    if (!value) throw new Error();
    const data = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
    if (data.length !== 32) throw new Error();
    return await crypto.subtle.importKey("raw", data, "AES-GCM", false, [
      "encrypt",
      "decrypt",
    ]);
  } catch {
    throw new AppError(
      "SERVER_CONFIGURATION",
      "보안 설정을 준비하고 있습니다. 잠시 후 다시 시도해 주세요.",
      503,
    );
  }
}
export async function encrypt(value: string, context: string, env: Env) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(context) },
    await importKey(env.APP_ENCRYPTION_KEY_B64),
    new TextEncoder().encode(value),
  );
  return JSON.stringify({
    version: 1,
    kid: env.APP_ENCRYPTION_KEY_VERSION,
    iv: btoa(String.fromCharCode(...iv)),
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
  });
}
export async function decrypt(envelope: string, context: string, env: Env) {
  try {
    const data = JSON.parse(envelope) as {
      version: number;
      kid: string;
      iv: string;
      ciphertext: string;
    };
    if (data.version !== 1) throw new Error();
    const secret =
      data.kid === env.APP_ENCRYPTION_KEY_VERSION
        ? env.APP_ENCRYPTION_KEY_B64
        : data.kid === env.APP_ENCRYPTION_KEY_PREVIOUS_VERSION
          ? env.APP_ENCRYPTION_KEY_PREVIOUS_B64
          : undefined;
    const result = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: Uint8Array.from(atob(data.iv), (c) => c.charCodeAt(0)),
        additionalData: new TextEncoder().encode(context),
      },
      await importKey(secret),
      Uint8Array.from(atob(data.ciphertext), (c) => c.charCodeAt(0)),
    );
    return new TextDecoder().decode(result);
  } catch {
    throw new AppError(
      "CREDENTIAL_UNAVAILABLE",
      "연결 정보를 사용할 수 없습니다. OpenRouter를 다시 연결해 주세요.",
      503,
    );
  }
}
