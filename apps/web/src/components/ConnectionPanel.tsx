import { useEffect, useState } from "react";
import { ArrowUpRight, LockKeyhole } from "lucide-react";
import { Button, BrandLockup } from "@photo-studio/ui";
import { apiBase, errorMessage, request } from "../lib/api";
export default function ConnectionPanel() {
  const [demo, setDemo] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    request<{ demoAllowed: boolean }>("/api/v1/config")
      .then((c) => setDemo(c.demoAllowed))
      .catch(() => {});
  }, []);
  async function mock() {
    setBusy(true);
    try {
      await request("/auth/demo", { method: "POST" });
      location.replace("/studio");
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <section className="mx-auto my-10 max-w-xl rounded-panel border border-line bg-surface p-7 sm:p-10">
      <BrandLockup />
      <div className="mt-8 flex items-center gap-3">
        <LockKeyhole size={20} className="text-primary" aria-hidden="true" />
        <h1 className="text-2xl">OpenRouter로 스튜디오 연결</h1>
      </div>
      <p className="mt-4 text-sm leading-7 text-muted">
        초대 코드 없이 본인의 OpenRouter 계정으로 시작합니다. 비밀번호나 API
        Key를 이 화면에 입력하지 않습니다.
      </p>
      <p className="mt-4 rounded-xl bg-paper p-4 text-xs leading-7 text-muted">
        연결 자체로 AI가 호출되지는 않습니다. 사진 분석과 이미지 생성은 각각
        비용 안내를 확인하고 승인한 뒤 실행되며, 비용은 내 OpenRouter 크레딧으로
        청구됩니다.
      </p>
      {error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      )}
      <a
        className="pill-link mt-6 w-full"
        href={`${apiBase}/auth/openrouter/start`}
        data-astro-reload
      >
        OpenRouter로 연결 <ArrowUpRight size={16} aria-hidden="true" />
      </a>
      {demo && (
        <Button
          className="mt-3 w-full"
          variant="secondary"
          disabled={busy}
          onClick={() => void mock()}
        >
          로컬 Mock 스튜디오 열기
        </Button>
      )}
      <a className="mt-6 block text-xs text-muted underline" href="/privacy">
        사진과 데이터 보관 안내
      </a>
    </section>
  );
}
