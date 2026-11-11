import { useState } from "react";
import { Button, Modal } from "@photo-studio/ui";
import { ExternalLink, Download, LogOut } from "lucide-react";
import { useAccount } from "../lib/account";
import { apiBase, errorMessage, request } from "../lib/api";
import WorkspaceShell from "./WorkspaceShell";

export default function AccountSettings() {
  const { me, error, setError, state, retry } = useAccount();
  const [busy, setBusy] = useState(false);
  const [remove, setRemove] = useState(false),
    [confirmation, setConfirmation] = useState("");
  async function erase() {
    if (!me || confirmation !== "삭제") return;
    setBusy(true);
    setError("");
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
  async function logout() {
    if (!me || busy) return;
    setBusy(true);
    setError("");
    try {
      await request("/auth/logout", { method: "POST" }, me.csrf);
      location.assign("/");
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  const textLink =
    "inline-flex min-h-11 items-center gap-2 text-sm text-muted hover:text-ink";
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
            <section className="mt-8 rounded-panel border border-line bg-surface p-6 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <h2 className="flex items-center gap-3 text-lg">
                  <span
                    className="size-2 rounded-full bg-primary"
                    aria-hidden="true"
                  />
                  {me.mode === "mock"
                    ? "Mock 테스트 계정"
                    : "OpenRouter 사용 중"}
                </h2>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void logout()}
                >
                  <LogOut size={16} aria-hidden="true" />
                  {busy ? "처리 중" : "로그아웃"}
                </Button>
              </div>
              {me.mode !== "mock" && (
                <a
                  className={`${textLink} mt-3`}
                  href="https://openrouter.ai/settings/credits"
                  target="_blank"
                  rel="noreferrer"
                >
                  크레딧 관리 <ExternalLink size={14} aria-hidden="true" />
                </a>
              )}
            </section>
            <section className="mt-6 rounded-panel border border-line bg-surface p-6 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
                <h2 className="text-lg">내 데이터</h2>
                <a href="/privacy" className={textLink}>
                  사진과 데이터 보관 안내{" "}
                  <ExternalLink size={13} aria-hidden="true" />
                </a>
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                <a
                  href={`${apiBase}/api/v1/account/export`}
                  data-astro-reload
                  className={textLink}
                >
                  <Download size={15} aria-hidden="true" />내 데이터 내보내기
                </a>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setConfirmation("");
                    setRemove(true);
                  }}
                >
                  {me.deleting ? "계정 삭제 마무리" : "계정과 모든 데이터 삭제"}
                </Button>
              </div>
              {me.deleting && (
                <p role="status" className="mt-4 text-sm text-danger">
                  사진 정리를 마치려면 계정 삭제를 다시 실행해 주세요.
                </p>
              )}
            </section>
          </>
        )}
        <Modal
          open={remove}
          onClose={() => {
            if (!busy) setRemove(false);
          }}
          title="계정과 사진을 영구 삭제할까요?"
          description="모든 상품·사진·작업 기록을 삭제합니다. 복구할 수 없습니다."
        >
          <label className="mt-5 block text-sm">
            계속하려면 ‘삭제’를 입력하세요.
            <input
              className="studio-input mt-3"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="off"
              disabled={busy}
            />
          </label>
          <Button
            className="mt-6 w-full"
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
