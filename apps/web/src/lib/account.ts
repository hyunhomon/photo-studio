import { useEffect, useState } from "react";
import { apiBase, ApiError, errorMessage, type Me, request } from "./api";
import { oauthMessages } from "@photo-studio/schemas";

export function useAccount() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const authError = new URLSearchParams(location.search).get("auth_error");
    if (authError) {
      setError(
        oauthMessages[authError] ??
          oauthMessages.OAUTH_CONNECT_FAILED ??
          "연결 오류",
      );
      history.replaceState(null, "", location.pathname);
    }
    request<Me>("/api/v1/me", { signal: controller.signal })
      .then((data) => {
        if (data.deleting && location.pathname !== "/studio/settings")
          location.replace("/studio/settings");
        setMe(data);
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        if (e instanceof ApiError && e.status === 401) {
          if (authError) return;
          request<{ demoAllowed: boolean }>("/api/v1/config")
            .then((config) => {
              if (!config.demoAllowed)
                location.replace(`${apiBase}/auth/openrouter/start`);
            })
            .catch(() =>
              setError("서버에 연결할 수 없습니다. 다시 연결해 주세요."),
            );
        } else setError(errorMessage(e));
      });
    return () => controller.abort();
  }, []);
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
  return { me, error, setError };
}
