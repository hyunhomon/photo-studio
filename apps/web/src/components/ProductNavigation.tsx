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
import { BrandLockup, Button, Modal } from "@photo-studio/ui";
import {
  SquarePen,
  Search,
  Pencil,
  Trash2,
  ArrowUpRight,
  SlidersHorizontal,
  ChartNoAxesColumn,
  X,
} from "lucide-react";
import type { ProductSummaryDto } from "@photo-studio/schemas";
import { request, errorMessage, type Me } from "../lib/api";

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
                data-autofocus
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
  activeProductId,
  section,
  mobile = false,
  onClose,
  onChanged,
}: {
  me: Me | null;
  products: ProductSummaryDto[];
  loading: boolean;
  listError: string;
  onRetry: () => void;
  onNew: () => void;
  onSearch: () => void;
  activeProductId?: string;
  section: string;
  mobile?: boolean;
  onClose?: () => void;
  onChanged: () => void;
}) {
  const [action, setAction] = useState<{
    product: ProductSummaryDto;
    kind: "rename" | "delete";
  } | null>(null);
  const [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit() {
    if (!action || !me) return;
    setBusy(true);
    setError("");
    try {
      await request(
        `/api/v1/products/${action.product.id}`,
        action.kind === "delete"
          ? { method: "DELETE" }
          : { method: "PATCH", body: JSON.stringify({ name: name.trim() }) },
        me.csrf,
      );
      onChanged();
      if (action.kind === "rename")
        window.dispatchEvent(new CustomEvent("studio:product-changed"));
      setAction(null);
      if (action.kind === "delete" && activeProductId === action.product.id)
        await navigate("/studio");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
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
  const groups = [{ label: "내 상품", items: products }];
  const iconButton =
    "grid size-9 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-studio hover:text-ink";
  return (
    <div className={`flex h-full min-h-0 flex-col px-3 pb-3 pt-4`}>
      <div
        className={`mb-5 flex min-h-10 items-center justify-between gap-2 px-2`}
      >
        {
          <a
            href="/studio"
            onClick={(event) => follow(event, "/studio")}
            className="sidebar-brand min-w-0"
            aria-label="Photo Studio 홈"
          >
            <BrandLockup stacked />
          </a>
        }
        {mobile && (
          <button
            type="button"
            className={iconButton}
            onClick={onClose}
            aria-label="상품 목록 닫기"
          >
            <X size={19} />
          </button>
        )}
      </div>
      <div className="space-y-1">
        <button
          type="button"
          onClick={onNew}
          disabled={!me}
          title="새 상품"
          className={`sidebar-item w-full disabled:opacity-40 `}
        >
          <SquarePen size={18} aria-hidden="true" />
          <span className="text-sm font-semibold text-ink">새 상품</span>
        </button>
      </div>
      <div className="mt-6 flex items-center justify-between px-3">
        <h2 className="font-sans text-sm font-normal text-muted">내 상품</h2>
        <button
          type="button"
          aria-label="상품 검색"
          title="상품 검색 (Ctrl K)"
          onClick={onSearch}
          disabled={!me}
          className={iconButton}
        >
          <Search size={16} />
        </button>
      </div>
      <nav
        aria-label="상품 목록"
        className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain"
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
            <p>목록을 불러오지 못했습니다.</p>
            <button type="button" onClick={onRetry} className="mt-2 underline">
              다시 확인
            </button>
          </div>
        ) : !me ? null : products.length ? (
          groups
            .filter((g) => g.items.length)
            .map((group) => (
              <div key={group.label} className="mb-5">
                {group.items.map((product) => (
                  <div
                    key={product.id}
                    data-product-id={product.id}
                    className={`group relative mb-0.5 flex min-h-11 items-center rounded-lg ${activeProductId === product.id ? "bg-elevated text-ink" : "text-muted hover:bg-studio hover:text-ink"}`}
                  >
                    <a
                      href={`/studio/products/${product.id}`}
                      title={product.name}
                      aria-current={
                        activeProductId === product.id ? "page" : undefined
                      }
                      onClick={(event) =>
                        follow(event, `/studio/products/${product.id}`)
                      }
                      className={`min-w-0 flex-1 truncate py-3 text-xs px-3 pr-16`}
                    >
                      {product.name}
                    </a>
                    {
                      <div className="product-row-actions absolute right-1 flex items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <button
                          type="button"
                          aria-label="상품 제목 수정"
                          title="제목 수정"
                          className="grid size-8 place-items-center rounded-md bg-transparent hover:bg-control active:bg-control"
                          onClick={() => {
                            setName(product.name);
                            setError("");
                            setAction({ product, kind: "rename" });
                          }}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          aria-label="상품 삭제"
                          title="상품 삭제"
                          className="grid size-8 place-items-center rounded-md bg-transparent hover:bg-control active:bg-control hover:text-danger"
                          onClick={() => {
                            setError("");
                            setAction({ product, kind: "delete" });
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    }
                  </div>
                ))}
              </div>
            ))
        ) : (
          <div className="px-3 text-xs leading-6 text-muted/80">
            <p>아직 상품이 없어요.</p>
            <p className="mt-1">
              새 촬영을 시작하면
              <br />
              이곳에서 이어갈 수 있습니다.
            </p>
          </div>
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
            className={`sidebar-item  ${section === label ? "bg-elevated" : "text-muted"}`}
          >
            <Icon size={17} aria-hidden="true" />
            <span>{label}</span>
          </a>
        ))}
      </nav>
      <a
        aria-label={
          me?.mode === "mock"
            ? "Mock 사용 중"
            : me?.connected
              ? "OpenRouter 사용 중"
              : "OpenRouter 연결"
        }
        href="/studio/settings"
        title={
          me?.mode === "mock"
            ? "Mock 사용 중"
            : me?.connected
              ? "OpenRouter 사용 중"
              : "OpenRouter 연결"
        }
        onClick={(event) => follow(event, "/studio/settings")}
        aria-current={section === "계정과 데이터" ? "page" : undefined}
        className={`mt-2 flex min-h-14 items-center gap-3 rounded-xl hover:bg-studio px-3`}
      >
        <span className="flex min-w-0 items-center gap-3 text-sm font-semibold">
          <span
            aria-hidden="true"
            className={`size-2 rounded-full ${me?.connected ? "bg-primary" : "bg-muted"}`}
          />
          {me?.mode === "mock"
            ? "Mock 사용 중"
            : me?.connected
              ? "OpenRouter 사용 중"
              : "OpenRouter 연결"}
        </span>
      </a>
      <Modal
        open={Boolean(action)}
        onClose={() => {
          if (!busy) setAction(null);
        }}
        title={
          action?.kind === "rename" ? "상품 제목 수정" : "상품을 삭제할까요?"
        }
        description={
          action?.kind === "delete"
            ? "의류와 참조 사진, 생성 결과와 작업 기록을 모두 삭제합니다."
            : "사이드바에 표시할 이름을 정해 주세요."
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {action?.kind === "rename" && (
            <label className="mt-5 block text-xs text-muted">
              상품 제목
              <input
                data-autofocus
                className="studio-input mt-2"
                value={name}
                maxLength={120}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          )}
          {error && (
            <p role="alert" className="mt-4 text-sm text-danger">
              {error}
            </p>
          )}
          <div className="mt-5 flex justify-end gap-3">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setAction(null)}
            >
              취소
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={busy || (action?.kind === "rename" && !name.trim())}
            >
              {action?.kind === "delete" ? "상품 영구 삭제" : "제목 저장"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
