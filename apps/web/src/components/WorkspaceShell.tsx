import { useEffect, useState, type ReactNode } from "react";
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { Menu, Search, SquarePen, ArrowUpRight, RefreshCw } from "lucide-react";
import { Button } from "@photo-studio/ui";
import type { ProductSummaryDto } from "@photo-studio/schemas";
import type { AccountState } from "../lib/account";
import { request, type Me } from "../lib/api";
import ConnectionPanel from "./ConnectionPanel";
import WorkspaceSkeleton from "./WorkspaceSkeleton";
import { navigate } from "astro:transitions/client";
import { ProductNavigation, ProductSearch } from "./ProductNavigation";

export default function WorkspaceShell({
  children,
  me,
  accountState,
  onRetry,
  section = "스튜디오",
  error,
  activeProductId,
  title,
  welcome = false,
  workbench = false,
}: {
  children: ReactNode;
  me: Me | null;
  accountState: AccountState;
  onRetry: () => void;
  section?: string;
  error?: string;
  activeProductId?: string;
  title?: string;
  welcome?: boolean;
  workbench?: boolean;
}) {
  const [products, setProducts] = useState<ProductSummaryDto[]>([]),
    [loading, setLoading] = useState(true),
    [listError, setListError] = useState("");
  const [listAttempt, setListAttempt] = useState(0),
    [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false),
    [search, setSearch] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(sessionStorage.getItem("ps:sidebar:collapsed") === "true");
    } catch {
      /* Preference storage is optional. */
    }
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: retry and a product rename explicitly refresh the private sidebar list.
  useEffect(() => {
    if (!me) return;
    const controller = new AbortController();
    setLoading(true);
    setListError("");
    request<ProductSummaryDto[]>("/api/v1/products", {
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) setProducts(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setListError("목록 조회 실패");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [me, listAttempt, title]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (me && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setDrawer(false);
        setSearch(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [me]);
  function toggle() {
    setCollapsed((value) => {
      try {
        sessionStorage.setItem("ps:sidebar:collapsed", String(!value));
      } catch {}
      return !value;
    });
  }
  const nav = {
    me,
    products,
    loading: loading && !["unauthenticated", "error"].includes(accountState),
    listError,
    onRetry: () => setListAttempt((n) => n + 1),
    onNew: () => {
      setDrawer(false);
      void navigate("/studio");
    },
    onSearch: () => {
      setDrawer(false);
      setSearch(true);
    },
    collapsed,
    onToggle: toggle,
    activeProductId,
    section,
  };
  const pending = accountState === "pending" || accountState === "redirecting";
  const heading =
    title || products.find((p) => p.id === activeProductId)?.name || section;
  return (
    <div
      className={`min-h-dvh lg:grid ${collapsed ? "lg:grid-cols-[64px_minmax(0,1fr)]" : "lg:grid-cols-[208px_minmax(0,1fr)] xl:grid-cols-[264px_minmax(0,1fr)]"}`}
    >
      <aside
        className="sticky top-0 hidden h-dvh min-w-0 border-r border-line/60 bg-sidebar lg:block"
        aria-label="작업 사이드바"
      >
        <ProductNavigation {...nav} />
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line/40 bg-paper/95 px-4 backdrop-blur-md sm:px-7 lg:border-line/40 lg:px-7">
          <button
            type="button"
            aria-label="상품 목록 열기"
            onClick={() => setDrawer(true)}
            className="grid size-10 shrink-0 place-items-center rounded-lg text-muted hover:bg-studio lg:hidden"
          >
            <Menu size={20} aria-hidden="true" />
          </button>
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-muted">
            {heading}
          </p>
          {me?.mode === "mock" && (
            <span className="rounded-md border border-accent-line bg-accent-soft px-2 py-1 text-[9px] text-primary">
              MOCK · 외부 AI 호출 없음
            </span>
          )}
          <button
            type="button"
            aria-label="상품 검색"
            onClick={() => setSearch(true)}
            disabled={!me}
            className="grid size-10 shrink-0 place-items-center rounded-lg text-muted hover:bg-studio disabled:opacity-40 lg:hidden"
          >
            <Search size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="새 상품"
            onClick={() => void navigate("/studio")}
            disabled={!me}
            className="grid size-10 shrink-0 place-items-center rounded-lg text-muted hover:bg-studio disabled:opacity-40 lg:hidden"
          >
            <SquarePen size={18} aria-hidden="true" />
          </button>
          <a
            href="/privacy"
            className="hidden items-center gap-1 text-[10px] text-muted hover:text-ink sm:flex"
          >
            사진과 데이터
            <ArrowUpRight size={12} aria-hidden="true" />
          </a>
        </header>
        <main
          id="main"
          className={
            workbench
              ? "workbench-main"
              : `mx-auto max-w-[1480px] px-4 sm:px-7 lg:px-10 ${welcome ? "" : "py-6 lg:py-9"}`
          }
        >
          {error && (
            <p
              role="alert"
              className="mb-5 rounded-xl border border-danger-line bg-danger-surface p-4 text-sm leading-6 text-danger"
            >
              {error}
            </p>
          )}
          {pending ? (
            <WorkspaceSkeleton
              label={
                accountState === "redirecting"
                  ? "OpenRouter로 이동하고 있습니다"
                  : "스튜디오를 불러오고 있습니다"
              }
            />
          ) : accountState === "unauthenticated" ? (
            <ConnectionPanel />
          ) : accountState === "error" ? (
            <section className="mx-auto max-w-lg py-20 text-center">
              <RefreshCw
                size={25}
                className="mx-auto text-muted"
                aria-hidden="true"
              />
              <h1 className="mt-5 text-xl">
                스튜디오에 잠시 연결할 수 없어요.
              </h1>
              <p className="mt-3 text-sm leading-7 text-muted">
                연결 상태를 다시 확인해 주세요.
              </p>
              <Button variant="secondary" className="mt-6" onClick={onRetry}>
                다시 확인
              </Button>
            </section>
          ) : (
            children
          )}
        </main>
      </div>
      <Dialog
        open={drawer}
        onClose={() => setDrawer(false)}
        className="relative z-40 lg:hidden"
      >
        <DialogBackdrop className="fixed inset-0 bg-overlay/70 backdrop-blur-sm" />
        <DialogPanel className="fixed inset-y-0 left-0 w-[min(310px,88vw)] bg-sidebar shadow-2xl">
          <DialogTitle className="sr-only">스튜디오 탐색</DialogTitle>
          <ProductNavigation
            {...nav}
            collapsed={false}
            mobile
            onClose={() => setDrawer(false)}
          />
        </DialogPanel>
      </Dialog>

      <ProductSearch
        key={String(search)}
        open={search}
        onClose={() => setSearch(false)}
        products={products}
      />
    </div>
  );
}
