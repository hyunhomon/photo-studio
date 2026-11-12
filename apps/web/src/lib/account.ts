import { useEffect, useState } from "react";
import {
  apiBase,
  isUnauthenticated,
  errorMessage,
  type Me,
  request,
} from "./api";
import { oauthMessages } from "@photo-studio/schemas";
export type AccountState =
  "pending" | "ready" | "unauthenticated" | "redirecting" | "error";

export function useAccount() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState("");
  const [state, setState] = useState<AccountState>("pending");
  const [attempt, setAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: retry must explicitly revalidate the session; credentials are never cached.
  useEffect(() => {
    const controller = new AbortController();
    setState("pending");
    setError("");
    const authError = new URLSearchParams(location.search).get("auth_error");
    if (authError) {
      setError(
        oauthMessages[authError] ??
          oauthMessages.OAUTH_CONNECT_FAILED ??
          "연결 오류",
      );
      const url = new URL(location.href);
      url.searchParams.delete("auth_error");
      history.replaceState(
        history.state,
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    }
    request<Me>("/api/v1/me", { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        if (data.deleting && location.pathname !== "/studio/settings")
          location.replace("/studio/settings");
        setMe(data);
        setState("ready");
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        if (isUnauthenticated(e)) {
          if (authError) {
            setState("unauthenticated");
            return;
          }
          request<{ demoAllowed: boolean }>("/api/v1/config", {
            signal: controller.signal,
          })
            .then((config) => {
              if (controller.signal.aborted) return;
              if (!config.demoAllowed) {
                setState("redirecting");
                location.replace(`${apiBase}/auth/openrouter/start`);
              } else setState("unauthenticated");
            })
            .catch(() => {
              if (controller.signal.aborted) return;
              setState("error");
              setError(
                "서버에 연결할 수 없습니다. 잠시 후 다시 확인해 주세요.",
              );
            });
        } else {
          setState("error");
          setError(errorMessage(e));
        }
      });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    if (!me) return;
    const timer = setTimeout(
      () => {
        request<{ csrf: string }>("/auth/refresh", { method: "POST" }, me.csrf)
          .then((data) => setMe({ ...me, csrf: data.csrf }))
          .catch(() => setError("계정 연결을 다시 확인해 주세요."));
      },
      30 * 60 * 1000,
    );
    return () => clearTimeout(timer);
  }, [me]);
  return { me, error, setError, state, retry: () => setAttempt((n) => n + 1) };
}
