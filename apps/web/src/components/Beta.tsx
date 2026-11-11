import { useEffect, useState } from "react";
import { ArrowRight, Check, LockKeyhole } from "lucide-react";
import { Button, BrandLockup } from "@photo-studio/ui";
import { errorMessage, request } from "../lib/api";

const messages: Record<string, string> = {
  OAUTH_STATE_INVALID:
    "연결 요청이 만료됐거나 브라우저가 다릅니다. 이 화면에서 다시 연결해 주세요.",
  OAUTH_IDENTITY_UNAVAILABLE:
    "OpenRouter에서 안전하게 확인할 수 있는 계정 식별 정보를 받지 못했습니다. 계정을 연결하지 않았습니다.",
  OAUTH_ACCOUNT_MISMATCH:
    "기존 연결과 다른 계정입니다. 원래 OpenRouter 계정으로 다시 연결해 주세요.",
  INVITE_REQUIRED: "처음 참여하려면 유효한 초대 코드가 필요합니다.",
  OAUTH_CONNECT_FAILED:
    "연결을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.",
};
export default function Beta() {
  const [invite, setInvite] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [demo, setDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const code = new URLSearchParams(location.search).get("error");
    if (code) {
      setError(messages[code] ?? messages.OAUTH_CONNECT_FAILED ?? "연결 오류");
      history.replaceState(null, "", "/beta");
    }
    request<{ demoAllowed: boolean }>("/api/v1/config")
      .then((config) => setDemo(config.demoAllowed))
      .catch(() =>
        setError("서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요."),
      );
  }, []);
  async function connect(mock = false) {
    setBusy(true);
    setError("");
    try {
      if (mock) {
        await request("/auth/demo", { method: "POST" });
        location.assign("/studio");
      } else {
        const data = await request<{ url: string }>("/auth/openrouter/start", {
          method: "POST",
          body: JSON.stringify({ invite: invite.trim() || undefined }),
        });
        location.assign(data.url);
      }
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <main
      id="main"
      className="page-width grid min-h-[85vh] items-center gap-12 py-12 lg:grid-cols-2 lg:gap-24"
    >
      <div>
        <a href="/" aria-label="Photo Studio 홈" className="mb-14 inline-flex">
          <BrandLockup />
        </a>
        <p className="eyebrow mb-6 text-muted">
          AN INVITATION TO YOUR NEXT COLLECTION
        </p>
        <h1 className="text-4xl leading-tight tracking-tight sm:text-5xl">
          새로운 촬영을,
          <br />
          당신의 시선으로.
        </h1>
        <p className="mt-7 max-w-md text-base leading-8 text-muted">
          상품을 이해하고, 장면을 계획하고, 직접 선택하는 패션 스튜디오.
          초대받은 브랜드부터 함께 시작합니다.
        </p>
        <ol className="mt-9 space-y-5 text-sm">
          {[
            "초대 코드로 클로즈드 베타 참여",
            "내 OpenRouter 계정으로 안전하게 연결",
            "비용 확인 후 분석과 생성을 각각 실행",
          ].map((t) => (
            <li key={t} className="flex items-center gap-3">
              <Check size={17} className="text-primary" aria-hidden="true" />
              {t}
            </li>
          ))}
        </ol>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void connect();
        }}
        className="rounded-panel border border-line bg-surface p-7 shadow-sm sm:p-10"
      >
        <LockKeyhole
          size={24}
          className="text-primary"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <h2 className="mt-5 text-2xl">스튜디오 연결</h2>
        <p className="mt-3 text-sm leading-6 text-muted">
          이미 참여 중이라면 초대 코드 없이 다시 연결할 수 있습니다.
        </p>
        <label htmlFor="invite" className="mt-7 block text-sm font-semibold">
          초대 코드{" "}
          <span className="font-normal text-muted">· 신규 참여 시 필요</span>
        </label>
        <input
          id="invite"
          name="invite"
          value={invite}
          onChange={(e) => setInvite(e.target.value)}
          autoComplete="off"
          maxLength={200}
          className="studio-input mt-2"
          placeholder="받으신 초대 코드를 입력하세요"
        />
        <div className="mt-6 rounded-xl bg-paper p-4 text-xs leading-6 text-muted">
          원본 사진과 촬영 지시는 OpenRouter 및 모델 제공업체로 전송됩니다.
          분석·기획과 이미지 생성·검수는 각 실행 전 동의를 받으며, 비용은{" "}
          <strong className="text-ink">본인의 OpenRouter 크레딧</strong>으로
          청구됩니다. 서비스 자체 결제는 없습니다.
        </div>
        <label className="my-6 flex cursor-pointer items-start gap-3 text-xs leading-6">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-1 size-4 accent-primary"
            required
          />
          <span>
            외부 AI 처리와 비용 안내를 확인했습니다. 연결만으로 AI가 호출되지는
            않습니다.
          </span>
        </label>
        {error && (
          <p
            role="alert"
            className="mb-4 rounded-lg bg-danger-surface p-3 text-sm text-danger"
          >
            {error}
          </p>
        )}
        <Button type="submit" disabled={!accepted || busy} className="w-full">
          {busy ? "연결 중…" : "OpenRouter로 연결"}
          <ArrowRight size={16} aria-hidden="true" />
        </Button>
        {demo && (
          <Button
            variant="secondary"
            onClick={() => void connect(true)}
            disabled={busy}
            className="mt-3 w-full"
          >
            로컬 Mock 스튜디오 열기
          </Button>
        )}
        <p className="mt-5 text-[11px] leading-5 text-muted">
          비밀번호와 API Key를 이 화면에 입력하지 않습니다. 발급된 키는 서버에서
          암호화해 보관합니다.{" "}
          <a href="/privacy" className="underline underline-offset-2">
            보관·삭제 안내
          </a>
        </p>
      </form>
    </main>
  );
}
