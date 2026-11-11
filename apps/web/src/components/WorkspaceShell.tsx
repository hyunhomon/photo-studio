import {
  FolderOpen,
  SlidersHorizontal,
  ChartNoAxesColumn,
  Settings2,
  ArrowUpRight,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";
import type { Me } from "../lib/api";
import { BrandLockup } from "@photo-studio/ui";

export default function WorkspaceShell({
  children,
  me,
  section = "프로젝트",
  error,
}: {
  children: ReactNode;
  me: Me | null;
  section?: string;
  error?: string;
}) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[224px_1fr]">
      <aside className="flex flex-col border-b border-line bg-sidebar px-5 py-6 lg:sticky lg:top-0 lg:h-screen lg:border-r lg:border-b-0">
        <a
          href="/"
          aria-label="Photo Studio 홈"
          className="flex w-fit items-center py-1"
        >
          <BrandLockup stacked />
        </a>
        <div className="mt-7 rounded-xl border border-line bg-paper/70 px-4 py-3">
          <p className="flex items-center justify-between text-xs font-semibold">
            MY STUDIO <span className="text-[9px] text-primary">BETA</span>
          </p>
          <p className="mt-1 text-[11px] text-muted">
            한 벌에서 시작하는 다음 컬렉션
          </p>
        </div>
        <nav
          aria-label="스튜디오 메뉴"
          className="mt-6 flex gap-2 overflow-x-auto lg:flex-col"
        >
          {[
            { href: "/studio", label: "프로젝트", icon: FolderOpen },
            {
              href: "/studio/presets",
              label: "브랜드 프리셋",
              icon: SlidersHorizontal,
            },
            {
              href: "/studio/usage",
              label: "사용 기록",
              icon: ChartNoAxesColumn,
            },
          ].map(({ href, label, icon: Icon }) => (
            <a
              key={href}
              href={href}
              aria-current={section === label ? "page" : undefined}
              className={`flex min-h-11 shrink-0 items-center gap-3 rounded-lg border px-3 py-3 text-xs whitespace-nowrap transition-colors ${section === label ? "border-accent-line bg-accent-soft text-primary" : "border-transparent text-muted hover:bg-studio hover:text-ink"}`}
            >
              <Icon size={16} aria-hidden="true" />
              {label}
            </a>
          ))}
        </nav>
        <div className="hidden flex-1 lg:block" />
        <div className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-5 lg:block">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold">
              <span
                className={`size-1.5 rounded-full ${me ? "bg-primary" : "bg-muted"}`}
              />
              {me?.mode === "mock"
                ? "Mock 테스트 연결"
                : me?.connected
                  ? "OpenRouter 연결됨"
                  : "계정 확인 중"}
            </p>
            <p className="mt-2 hidden text-[11px] leading-5 text-muted lg:block">
              {me?.mode === "mock"
                ? "합성 데이터 · 외부 AI 호출 없음"
                : "내 OpenRouter 계정으로 촬영합니다."}
            </p>
          </div>
          <a
            href="/studio/settings"
            className="mt-0 flex items-center gap-2 text-xs text-muted hover:text-ink lg:mt-4"
          >
            <Settings2 size={14} aria-hidden="true" />
            계정과 데이터
          </a>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex min-h-20 items-center justify-between gap-4 border-b border-line px-6 lg:px-10">
          <p className="text-xs text-muted">
            워크스페이스 <span className="mx-2 text-line">/</span>
            <span className="text-ink">{section}</span>
          </p>
          <a
            href="/privacy"
            className="flex items-center gap-1 text-[11px] text-muted"
          >
            사진과 데이터
            <ArrowUpRight size={13} aria-hidden="true" />
          </a>
        </header>
        {me?.mode === "mock" && (
          <div className="flex items-center gap-2 border-b border-accent-line bg-accent-soft px-6 py-2.5 text-[11px] text-primary lg:px-10">
            <Sparkles size={13} aria-hidden="true" />
            Mock 테스트 스튜디오입니다. 분석·생성·평가는 합성 결과이며 외부 AI
            비용이 발생하지 않습니다.
          </div>
        )}
        <main
          id="main"
          className="mx-auto max-w-[1560px] px-6 py-9 lg:px-10 xl:px-14"
        >
          {error && (
            <p
              role="alert"
              className="mb-6 rounded-xl border border-danger-line bg-danger-surface p-4 text-sm text-danger"
            >
              {error}
            </p>
          )}
          {!me ? (
            <p role="status" className="py-20 text-sm text-muted">
              스튜디오를 불러오고 있습니다…
            </p>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
