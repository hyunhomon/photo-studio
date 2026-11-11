import { useEffect, useState } from "react";
import { ApiError, errorMessage, type Me, request } from "./api";

export function useAccount() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    request<Me>("/api/v1/me", { signal: controller.signal })
      .then((data) => {
        if (data.deleting && location.pathname !== "/studio/settings")
          location.replace("/studio/settings");
        setMe(data);
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        if (e instanceof ApiError && e.status === 401)
          location.replace("/beta");
        else setError(errorMessage(e));
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
