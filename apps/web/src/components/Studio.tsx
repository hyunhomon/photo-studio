import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CircleHelp,
  FolderOpen,
  Layers3,
  Plus,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { Button, Modal } from "@photo-studio/ui";
import { healthSchema } from "@photo-studio/schemas";
import { useEffect, useState } from "react";

export default function Studio({
  apiUrl,
  deployment,
}: {
  apiUrl: string;
  deployment: "local" | "production";
}) {
  const isProduction = deployment === "production";
  const checkLabel = isProduction ? "API 연결 확인" : "로컬 API 연결 확인";
  // SSR can paint controls before their handlers are attached. Keep them
  // unavailable until the island is interactive so early clicks aren't lost.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [modal, setModal] = useState(false);
  const [health, setHealth] = useState<"idle" | "checking" | "ok" | "error">(
    "idle",
  );

  async function checkApi() {
    setHealth("checking");
    try {
      const response = await fetch(new URL("/health", apiUrl), {
        signal: AbortSignal.timeout(5000),
        credentials: "include",
      });
      if (!response.ok) throw new Error("Health check failed");
      healthSchema.parse(await response.json());
      setHealth("ok");
    } catch {
      setHealth("error");
    }
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[230px_1fr]">
      <aside className="flex flex-col border-b border-line bg-[#eceee5] px-6 py-6 lg:min-h-screen lg:border-r lg:border-b-0">
        <a
          href="/"
          className="flex items-center gap-3 text-xl font-semibold tracking-tight"
        >
          <span className="grid size-8 place-items-center rounded-full border border-ink font-editorial italic">
            p.
          </span>{" "}
          photo studio
        </a>
        <div className="mt-8 flex items-center gap-3 rounded-xl border border-line bg-paper/60 p-3">
          <span className="grid size-8 place-items-center rounded-lg bg-ink text-xs text-paper">
            PS
          </span>
          <div>
            <p className="text-xs font-semibold">
              {isProduction ? "프로덕션 스튜디오" : "로컬 스튜디오"}
            </p>
            <p className="mt-1 text-[10px] text-muted">개발 미리보기</p>
          </div>
        </div>
        <nav
          aria-label="스튜디오 메뉴"
          className="mt-8 flex flex-wrap gap-2 lg:flex-col"
        >
          <a
            href="/studio"
            aria-current="page"
            className="flex items-center gap-3 rounded-lg bg-ink px-3 py-3 text-sm text-paper"
          >
            <FolderOpen size={17} aria-hidden="true" />
            프로젝트
          </a>
          <button
            type="button"
            onClick={() => setModal(true)}
            disabled={!ready}
            className="flex items-center gap-2 rounded-lg px-3 py-3 text-xs whitespace-nowrap text-muted hover:bg-line/60"
          >
            <SlidersHorizontal size={17} aria-hidden="true" />
            브랜드 프리셋 <span className="ml-auto text-[9px]">준비 중</span>
          </button>
        </nav>
        <div className="hidden flex-1 lg:block" />
        <div className="mt-8 border-t border-line pt-5">
          <p className="flex items-center gap-2 text-xs font-medium">
            <ShieldCheck size={15} aria-hidden="true" />
            OpenRouter 미연결
          </p>
          <p className="mt-2 text-[11px] leading-5 text-muted">
            계정 연결은 다음 개발 단계에서
            <br />
            제공됩니다. 현재 AI 호출은 없습니다.
          </p>
          <button
            type="button"
            onClick={() => setModal(true)}
            disabled={!ready}
            className="mt-4 flex items-center gap-2 text-xs underline underline-offset-4"
          >
            <Settings2 size={14} aria-hidden="true" />
            연결 안내
          </button>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex min-h-20 flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4 lg:px-10">
          <p className="text-xs text-muted">
            워크스페이스 <span className="mx-3 text-line">/</span>
            <span className="text-ink">프로젝트</span>
          </p>
          <span className="rounded-full border border-line px-3 py-1.5 text-[10px] tracking-wide">
            {isProduction ? "PRODUCTION · PHASE 0" : "PHASE 0 · 개발 미리보기"}
          </span>
        </header>
        <main id="main" className="px-6 py-10 lg:px-10 xl:px-14">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="eyebrow mb-3 text-muted">
                YOUR NEXT COLLECTION STARTS HERE
              </p>
              <h1 className="text-4xl font-medium tracking-tight">
                나의 프로젝트
                <span className="ml-3 align-top font-editorial text-lg text-muted">
                  00
                </span>
              </h1>
              <p className="mt-4 text-sm text-muted">
                한 벌의 옷, 하나의 콘셉트. 새로운 촬영을 위한 공간입니다.
              </p>
            </div>
            <Button disabled={!ready} onClick={() => setModal(true)}>
              <Plus size={16} aria-hidden="true" />새 프로젝트
            </Button>
          </div>
          <div className="mt-9 flex items-center justify-between border-b border-line pb-4">
            <span className="flex items-center gap-2 text-xs font-semibold">
              <Layers3 size={15} aria-hidden="true" />
              전체 프로젝트 <span className="text-muted">0</span>
            </span>
            <span className="text-xs text-muted">
              아직 저장된 프로젝트가 없습니다
            </span>
          </div>
          <section className="my-7 grid min-h-[390px] place-items-center rounded-panel border border-dashed border-[#c4c9b8] bg-surface/70 px-6 py-12 text-center">
            <div className="max-w-md">
              <div className="relative mx-auto mb-7 grid size-20 place-items-center rounded-2xl border border-line bg-paper">
                <FolderOpen size={32} strokeWidth={1} aria-hidden="true" />
                <span className="absolute -right-2 -bottom-2 grid size-8 place-items-center rounded-full border-4 border-surface bg-accent">
                  <Plus size={14} aria-hidden="true" />
                </span>
              </div>
              <p className="eyebrow mb-3 text-muted">
                A BLANK CANVAS, A NEW PERSPECTIVE.
              </p>
              <h2 className="text-2xl font-medium tracking-tight">
                첫 번째 컬렉션을 기다리고 있어요.
              </h2>
              <p className="mt-4 text-sm leading-7 text-muted">
                시즌과 콘셉트별로 촬영을 정리할 수 있도록 준비하고 있습니다.
                프로젝트 저장과 이미지 업로드는 아직 지원하지 않습니다.
              </p>
              <Button
                variant="secondary"
                className="mt-7"
                onClick={() => setModal(true)}
                disabled={!ready}
              >
                시작 전 안내
                <ArrowUpRight size={15} aria-hidden="true" />
              </Button>
            </div>
          </section>
          <section
            aria-label="촬영 흐름 안내"
            className="grid gap-5 py-5 md:grid-cols-3"
          >
            {[
              ["01", "상품 사진 준비", "정면 사진 한 장에서 시작합니다."],
              ["02", "분석과 기획", "비용 안내 후 분석을 직접 시작합니다."],
              [
                "03",
                "생성과 검수",
                "별도 승인 후 생성하고, 비교해 선택합니다.",
              ],
            ].map(([number, title, detail]) => (
              <div key={number} className="flex gap-4">
                <span className="font-editorial text-2xl italic text-muted">
                  {number}
                </span>
                <div>
                  <h3 className="text-xs font-semibold">{title}</h3>
                  <p className="mt-2 text-[11px] leading-5 text-muted">
                    {detail}
                  </p>
                </div>
              </div>
            ))}
          </section>
          <aside className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
            <div className="flex items-start gap-2 text-xs text-muted">
              <CircleHelp size={15} aria-hidden="true" />
              <p>
                개발 미리보기에서는 데이터가 저장되지 않으며 외부 AI를 호출하지
                않습니다.
              </p>
            </div>
            <a
              href="/"
              className="flex items-center gap-2 text-xs underline underline-offset-4"
            >
              서비스 소개
              <ArrowDownLeft size={13} aria-hidden="true" />
            </a>
          </aside>
          <div className="mt-7 flex flex-wrap items-center gap-3 text-[11px] text-muted">
            <button
              type="button"
              onClick={checkApi}
              disabled={!ready || health === "checking"}
              className="underline underline-offset-4 disabled:opacity-50"
            >
              {health === "checking" ? "확인 중…" : checkLabel}
            </button>
            <span role="status">
              {health === "idle"
                ? "버튼을 눌러 API 서버 연결을 확인할 수 있습니다."
                : health === "checking"
                  ? "API 서버에 연결하고 있습니다."
                  : health === "ok"
                    ? "API 정상 · Mock 전용 · AI 호출 없음"
                    : "API에 연결할 수 없습니다. 서버 실행 상태를 확인해 주세요."}
            </span>
          </div>
        </main>
      </div>
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="촬영을 위한 준비 중입니다."
        description="현재는 개발 미리보기입니다. 프로젝트 생성, 사진 업로드, OpenRouter 연결은 아직 구현되지 않았습니다. 입력이나 저장 없이 화면 구성을 살펴볼 수 있습니다."
      >
        <div className="my-6 rounded-xl border border-line bg-surface p-5 text-sm leading-7">
          <p className="font-semibold">앞으로의 AI 사용 비용 안내</p>
          <p className="mt-2 text-muted">
            분석과 이미지 생성에는 사용자 본인의 OpenRouter 크레딧이 사용됩니다.
            각 단계에서 비용 안내를 확인하고 직접 실행해야 합니다. 파일
            선택만으로 AI가 실행되지 않습니다.
          </p>
        </div>
        <Button onClick={() => setModal(false)} className="w-full">
          확인했습니다
          <ArrowRight size={16} aria-hidden="true" />
        </Button>
      </Modal>
    </div>
  );
}
