import { useState } from "react";
import { Button, Modal } from "@photo-studio/ui";
import { ArrowLeft, ShieldCheck, ExternalLink } from "lucide-react";
import { useAccount } from "../lib/account";
import { errorMessage, request } from "../lib/api";

export default function AccountSettings() {
  const { me, error, setError } = useAccount();
  const [disconnect, setDisconnect] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  async function inspect() {
    try {
      const data = await request<{ status: string }>(
        "/api/v1/connection/status",
      );
      setStatus(
        data.status === "no_credit"
          ? "OpenRouter 키 사용 한도가 소진됐습니다. OpenRouter에서 크레딧과 한도를 확인해 주세요."
          : data.status === "mock"
            ? "Mock 전용 연결입니다. 외부 AI를 호출하지 않습니다."
            : "연결 키가 유효합니다. 실제 잔액과 모델 비용은 OpenRouter에서 확인해 주세요.",
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function leave(path: string) {
    if (!me) return;
    setBusy(true);
    try {
      await request(path, { method: "POST" }, me.csrf);
      location.assign("/beta");
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <main id="main" className="page-width max-w-3xl py-12">
      <a href="/studio" className="flex items-center gap-2 text-sm text-muted">
        <ArrowLeft size={16} aria-hidden="true" />
        스튜디오
      </a>
      <p className="eyebrow mt-10 text-muted">YOUR ACCOUNT, YOUR CONTROL</p>
      <h1 className="mt-3 text-3xl">계정과 데이터</h1>
      {error && (
        <p
          role="alert"
          className="mt-5 rounded-lg bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {!me ? (
        <p role="status" className="py-12 text-muted">
          계정 연결을 확인하고 있습니다…
        </p>
      ) : (
        <>
          <section className="mt-8 rounded-panel border border-line bg-surface p-7">
            <ShieldCheck size={24} aria-hidden="true" />
            <h2 className="mt-4 text-xl">
              {me.mode === "mock"
                ? "Mock 테스트 계정"
                : me.connected
                  ? "OpenRouter 연결됨"
                  : "OpenRouter 연결 필요"}
            </h2>
            <p className="mt-4 text-sm leading-7 text-muted">
              {me.mode === "mock"
                ? "합성 데이터로 작동하는 테스트 계정입니다. 외부 모델을 호출하거나 OpenRouter 크레딧을 사용하지 않습니다."
                : "사용자 본인의 OpenRouter 크레딧으로 AI를 사용합니다. 키는 서버에서 암호화해 보관하며 이 화면에 표시하지 않습니다."}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                className="pill-link"
                href="https://openrouter.ai/settings/credits"
                target="_blank"
                rel="noreferrer"
              >
                OpenRouter 크레딧 관리
                <ExternalLink size={14} aria-hidden="true" />
              </a>
              <Button variant="secondary" onClick={() => void inspect()}>
                연결 상태 확인
              </Button>
              <Button variant="secondary" onClick={() => setDisconnect(true)}>
                연결 해제
              </Button>
              <Button
                variant="secondary"
                onClick={() => void leave("/auth/logout")}
                disabled={busy}
              >
                로그아웃
              </Button>
            </div>
            {status && (
              <p role="status" className="mt-5 text-sm leading-7 text-muted">
                {status}
              </p>
            )}
          </section>
          <section className="mt-6 rounded-panel border border-line p-7">
            <h2 className="text-xl">사진과 데이터 보관</h2>
            <p className="mt-4 text-sm leading-7 text-muted">
              프로젝트와 사진은 삭제할 때까지 비공개로 보관합니다. 프로젝트 삭제
              시 관련 원본·결과와 작업 기록을 함께 삭제합니다.{" "}
              <a href="/privacy" className="underline underline-offset-4">
                외부 AI 처리·보관 안내
              </a>
            </p>
          </section>
        </>
      )}
      <Modal
        open={disconnect}
        onClose={() => setDisconnect(false)}
        title="OpenRouter 연결을 해제할까요?"
        description="서버에 보관한 연결 키와 모든 앱 세션을 삭제합니다. 프로젝트는 유지됩니다. OpenRouter에서 발급한 키 자체의 폐기는 OpenRouter Keys 화면에서 확인해 주세요."
      >
        <div className="mt-6 flex gap-3">
          <Button variant="secondary" onClick={() => setDisconnect(false)}>
            취소
          </Button>
          <Button
            onClick={() => void leave("/auth/disconnect")}
            disabled={busy}
          >
            연결 해제
          </Button>
        </div>
      </Modal>
    </main>
  );
}
