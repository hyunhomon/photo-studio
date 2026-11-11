import { useState } from "react";
import type { MouseEvent } from "react";
import { navigate } from "astro:transitions/client";
import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { BrandLockup, BrandMark } from "@photo-studio/ui";
import {
  SquarePen,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  Shirt,
  ArrowUpRight,
  SlidersHorizontal,
  ChartNoAxesColumn,
  Settings2,
  X,
} from "lucide-react";
import type { ProductSummaryDto } from "@photo-studio/schemas";
import type { Me } from "../lib/api";

export function ProductSearch({
  open,
  onClose,
  products,
}: {
  open: boolean;
  onClose: () => void;
  products: ProductSummaryDto[];
}) {
  const [query, setQuery] = useState("");
  const results = products.filter((p) =>
    `${p.name}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-overlay/70 backdrop-blur-sm" />
      <div className="fixed inset-0 flex items-start justify-center px-4 pt-[15dvh]">
        <DialogPanel className="w-full max-w-xl overflow-hidden rounded-2xl border border-control bg-surface shadow-2xl">
          <DialogTitle className="sr-only">상품 검색</DialogTitle>
          <Combobox
            value={null}
            onChange={(product: ProductSummaryDto | null) => {
              if (product) {
                onClose();
                const path = `/studio/products/${product.id}`;
                if (location.pathname !== path || location.search)
                  void navigate(path);
              }
            }}
          >
            <div className="flex items-center gap-3 border-b border-line px-5 py-3">
              <Search
                size={19}
                className="shrink-0 text-muted"
                aria-hidden="true"
              />
              <ComboboxInput
                autoFocus
                aria-label="상품 검색어"
                onChange={(e) => setQuery(e.target.value)}
                placeholder="상품 이름으로 검색"
                className="min-h-11 min-w-0 flex-1 bg-transparent text-sm outline-none focus:outline-none"
              />
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-2 text-muted hover:bg-studio"
                aria-label="검색 닫기"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <ComboboxOptions
              static
              className="max-h-[50dvh] overflow-y-auto p-2 outline-none"
            >
              {results.map((product) => (
                <ComboboxOption
                  key={product.id}
                  value={product}
                  className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-sm data-focus:bg-elevated"
                >
                  <Shirt
                    size={17}
                    className="shrink-0 text-muted"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {product.name}
                  </span>
                  <ArrowUpRight
                    size={14}
                    className="text-muted"
                    aria-hidden="true"
                  />
                </ComboboxOption>
              ))}
              {!results.length && (
                <p className="px-4 py-10 text-center text-sm text-muted">
                  {products.length
                    ? "일치하는 상품이 없습니다."
                    : "새 상품으로 첫 촬영을 시작해 보세요."}
                </p>
              )}
            </ComboboxOptions>
            <p className="border-t border-line px-5 py-3 text-[10px] text-muted">
              ↑ ↓ 선택 <span className="mx-2">·</span> Enter 열기{" "}
              <span className="mx-2">·</span> Esc 닫기
            </p>
          </Combobox>
        </DialogPanel>
      </div>
    </Dialog>
  );
}

export function ProductNavigation({
  me,
  products,
  loading,
  listError,
  onRetry,
  onNew,
  onSearch,
  collapsed,
  onToggle,
  activeProductId,
  section,
  mobile = false,
  onClose,
}: {
  me: Me | null;
  products: ProductSummaryDto[];
  loading: boolean;
  listError: string;
  onRetry: () => void;
  onNew: () => void;
  onSearch: () => void;
  collapsed: boolean;
  onToggle: () => void;
  activeProductId?: string;
  section: string;
  mobile?: boolean;
  onClose?: () => void;
}) {
  const cutoff = Date.now() - 7 * 86400000;
  function follow(event: MouseEvent<HTMLAnchorElement>, path: string) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    if (location.pathname === path && !location.search) {
      event.preventDefault();
      onClose?.();
      return;
    }
    if (!onClose) return;
    // Closing a Dialog removes the link before Astro's document click handler.
    event.preventDefault();
    onClose();
    void navigate(path);
  }
  const groups = [
    { label: "최근 7일", items: products.filter((p) => p.createdAt >= cutoff) },
    {
      label: "이전 상품",
      items: products.filter((p) => p.createdAt < cutoff),
    },
  ];
  const iconButton =
    "grid size-9 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-studio hover:text-ink";
  return (
    <div
      className={`flex h-full min-h-0 flex-col ${collapsed ? "px-2" : "px-3"} pb-3 pt-4`}
    >
      <div
        className={`mb-5 flex min-h-10 items-center ${collapsed ? "justify-center" : "justify-between gap-2 px-2"}`}
      >
        {!collapsed && (
          <a
            href="/studio"
            onClick={(event) => follow(event, "/studio")}
            className="sidebar-brand min-w-0"
            aria-label="Photo Studio 홈"
          >
            <BrandLockup stacked />
          </a>
        )}
        <button
          type="button"
          className={iconButton}
          onClick={mobile ? onClose : onToggle}
          aria-label={
            mobile
              ? "상품 목록 닫기"
              : collapsed
                ? "사이드바 펼치기"
                : "사이드바 접기"
          }
          aria-expanded={!collapsed}
        >
          {mobile ? (
            <X size={19} aria-hidden="true" />
          ) : collapsed ? (
            <PanelLeftOpen size={19} aria-hidden="true" />
          ) : (
            <PanelLeftClose size={19} aria-hidden="true" />
          )}
        </button>
      </div>
      {collapsed && (
        <a href="/studio" aria-label="스튜디오 홈" className="mx-auto mb-4">
          <BrandMark className="size-7 text-primary" />
        </a>
      )}
      <div className="space-y-1">
        <button
          type="button"
          onClick={onNew}
          disabled={!me}
          title="새 상품"
          className={`sidebar-item w-full disabled:opacity-40 ${collapsed ? "justify-center px-0" : ""}`}
        >
          <SquarePen size={18} aria-hidden="true" />
          <span className={collapsed ? "sr-only" : ""}>새 상품</span>
        </button>
        <button
          type="button"
          onClick={onSearch}
          disabled={!me}
          title="상품 검색"
          aria-label="상품 검색"
          className={`sidebar-item w-full text-muted disabled:opacity-40 ${collapsed ? "justify-center px-0" : ""}`}
        >
          <Search size={18} aria-hidden="true" />
          <span className={collapsed ? "sr-only" : ""}>상품 검색</span>
          {!collapsed && (
            <kbd className="ml-auto text-[9px] text-muted/70">Ctrl K</kbd>
          )}
        </button>
      </div>
      <nav
        aria-label="상품 목록"
        className="mt-7 min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {loading ? (
          <div
            aria-label="상품 목록을 불러오고 있습니다"
            role="status"
            className="space-y-3 px-3 motion-safe:animate-pulse"
          >
            <span className="sr-only">상품 목록을 불러오고 있습니다</span>
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                aria-hidden="true"
                className={`h-3 rounded bg-studio ${n % 2 ? "w-4/5" : "w-3/5"}`}
              />
            ))}
          </div>
        ) : listError ? (
          <div className="px-3 text-xs leading-6 text-muted">
            <p>{collapsed ? "목록 오류" : "목록을 불러오지 못했습니다."}</p>
            <button type="button" onClick={onRetry} className="mt-2 underline">
              다시 확인
            </button>
          </div>
        ) : !me ? null : products.length ? (
          groups
            .filter((g) => g.items.length)
            .map((group) => (
              <div key={group.label} className="mb-5">
                {!collapsed && (
                  <p className="mb-2 px-3 text-[10px] font-medium text-muted/80">
                    {group.label}
                  </p>
                )}
                {group.items.map((product) => (
                  <a
                    key={product.id}
                    href={`/studio/products/${product.id}`}
                    title={product.name}
                    aria-current={
                      activeProductId === product.id ? "page" : undefined
                    }
                    onClick={(event) =>
                      follow(event, `/studio/products/${product.id}`)
                    }
                    className={`sidebar-item mb-0.5 ${collapsed ? "justify-center px-0" : ""} ${activeProductId === product.id ? "bg-elevated text-ink" : "text-muted hover:text-ink"}`}
                  >
                    <Shirt size={16} className="shrink-0" aria-hidden="true" />
                    <span
                      className={
                        collapsed ? "sr-only" : "min-w-0 flex-1 truncate"
                      }
                    >
                      {product.name}
                    </span>
                    {!collapsed && product.status === "deleting" && (
                      <span className="text-[9px] text-warning">삭제 중</span>
                    )}
                  </a>
                ))}
              </div>
            ))
        ) : (
          !collapsed && (
            <div className="px-3 text-xs leading-6 text-muted/80">
              <p>아직 상품이 없어요.</p>
              <p className="mt-1">
                새 촬영을 시작하면
                <br />
                이곳에서 이어갈 수 있습니다.
              </p>
            </div>
          )
        )}
      </nav>
      <nav
        aria-label="스튜디오 도구"
        className="space-y-0.5 border-t border-line pt-3"
      >
        {[
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
            title={label}
            onClick={(event) => follow(event, href)}
            aria-current={section === label ? "page" : undefined}
            className={`sidebar-item ${collapsed ? "justify-center px-0" : ""} ${section === label ? "bg-elevated" : "text-muted"}`}
          >
            <Icon size={17} aria-hidden="true" />
            <span className={collapsed ? "sr-only" : ""}>{label}</span>
          </a>
        ))}
      </nav>
      <a
        href="/studio/settings"
        title="계정과 데이터"
        onClick={(event) => follow(event, "/studio/settings")}
        aria-current={section === "계정과 데이터" ? "page" : undefined}
        className={`mt-2 flex min-h-14 items-center gap-3 rounded-xl hover:bg-studio ${collapsed ? "justify-center" : "px-3"}`}
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-full border border-line bg-surface">
          <Settings2 size={16} aria-hidden="true" />
        </span>
        <span className={collapsed ? "sr-only" : "min-w-0"}>
          <span className="block text-xs font-medium">계정과 데이터</span>
          <span className="mt-1 block text-[10px] text-muted">
            {me
              ? me.mode === "mock"
                ? "Mock 스튜디오"
                : me.connected
                  ? "OpenRouter 연결됨"
                  : "연결 필요"
              : "스튜디오"}
          </span>
        </span>
        {!collapsed && me?.connected && (
          <span
            className="ml-auto size-1.5 shrink-0 rounded-full bg-primary"
            aria-hidden="true"
          />
        )}
      </a>
    </div>
  );
}
