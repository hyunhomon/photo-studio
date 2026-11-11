import { useState } from "react";
import { Button, Modal } from "@photo-studio/ui";
import { ShieldCheck, ExternalLink } from "lucide-react";
import { useAccount } from "../lib/account";
import { apiBase, errorMessage, request } from "../lib/api";
import WorkspaceShell from "./WorkspaceShell";

export default function AccountSettings() {
  const { me, error, setError, state, retry } = useAccount();
  const [disconnect, setDisconnect] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [remove, setRemove] = useState(false),
    [confirmation, setConfirmation] = useState("");
  async function erase() {
    if (!me || confirmation !== "삭제") return;
    setBusy(true);
    try {
      await request(
        "/api/v1/account",
        { method: "DELETE", body: JSON.stringify({ confirm: "DELETE" }) },
        me.csrf,
      );
      location.assign("/");
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
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
      location.assign("/");
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <WorkspaceShell
      me={me}
      error={error}
      accountState={state}
      onRetry={retry}
      section="계정과 데이터"
    >
      <div className="mx-auto max-w-3xl">
        <h1 className="mt-3 text-3xl">계정과 데이터</h1>
        {me && (
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
                {me.mode !== "mock" && (
                  <a
                    className="pill-link"
                    href={`${apiBase}/auth/openrouter/start?reconnect=1`}
                    data-astro-reload
                  >
                    OpenRouter 다시 연결
                  </a>
                )}
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
                상품와 사진은 삭제할 때까지 비공개로 보관합니다. 상품 삭제 시
                관련 원본·결과와 작업 기록을 함께 삭제합니다.{" "}
                <a href="/privacy" className="underline underline-offset-4">
                  외부 AI 처리·보관 안내
                </a>
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <a
                  href={`${apiBase}/api/v1/account/export`}
                  data-astro-reload
                  className="pill-link"
                >
                  내 데이터 내보내기
                </a>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setConfirmation("");
                    setRemove(true);
                  }}
                >
                  {me.deleting ? "계정 삭제 마무리" : "계정과 모든 데이터 삭제"}
                </Button>
              </div>
              <p className="mt-4 text-xs leading-6 text-muted">
                내보내기는 기록 JSON 파일입니다. 사진은 각 상품에서 PNG로
                다운로드할 수 있습니다. 계정 삭제 후 OpenRouter 키 폐기는 제공자
                화면에서도 확인해 주세요.
              </p>
              {me.deleting && (
                <p role="status" className="mt-4 text-sm">
                  사진 정리가 완료되지 않았습니다. 계정 삭제를 다시 실행해
                  마무리해 주세요.
                </p>
              )}
            </section>
          </>
        )}
        <Modal
          open={disconnect}
          onClose={() => setDisconnect(false)}
          title="OpenRouter 연결을 해제할까요?"
          description="진행 중 작업의 중단을 요청하고 서버 연결 키와 앱 세션을 삭제합니다. 이미 시작된 AI 호출은 과금될 수 있습니다. 상품는 유지되며 OpenRouter 키 자체의 폐기는 제공자 Keys 화면에서 확인해 주세요."
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
        <Modal
          open={remove}
          onClose={() => setRemove(false)}
          title="계정과 사진을 영구 삭제할까요?"
          description="모든 상품·원본·결과·기획·작업·피드백과 연결 키를 삭제합니다. 복구할 수 없습니다. 이미 시작된 외부 AI 호출의 비용과 제공자의 보관 기록은 취소되지 않습니다."
        >
          <label className="mt-5 block text-sm">
            계속하려면 ‘삭제’를 입력하세요.
            <input
              className="studio-input mt-3"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="off"
            />
          </label>
          <Button
            className="mt-6 w-full"
            variant="primary"
            disabled={busy || confirmation !== "삭제"}
            onClick={() => void erase()}
          >
            계정 영구 삭제
          </Button>
        </Modal>
      </div>
    </WorkspaceShell>
  );
}
