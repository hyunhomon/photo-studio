import { useEffect, useId, useRef, useState } from "react";
import {
  ImagePlus,
  X,
  Plus,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  LoaderCircle,
} from "lucide-react";
import { Button } from "@photo-studio/ui";
import type { ProductDto } from "@photo-studio/schemas";
import { errorMessage, request } from "../lib/api";

export function PhotoPicker({
  label,
  files,
  onChange,
  max = 3,
  disabled = false,
}: {
  label: string;
  files: File[];
  onChange: (files: File[]) => void;
  max?: number;
  disabled?: boolean;
}) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const touchStart = useRef<number | null>(null);
  const [previews, setPreviews] = useState<{ url: string; name: string }[]>([]);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const selected = Math.min(index, Math.max(0, previews.length - 1));
  const preview = previews[selected];
  const title = label.startsWith("촬영")
    ? "레퍼런스"
    : label.startsWith("인물")
      ? "인물"
      : "상품";
  useEffect(() => {
    const list = files.map((file) => ({
      url: URL.createObjectURL(file),
      name: file.name,
    }));
    setPreviews(list);
    return () => {
      for (const item of list) URL.revokeObjectURL(item.url);
    };
  }, [files]);
  function add(incoming: File[]) {
    if (!incoming.length || disabled) return;
    setError("");
    const next = max === 1 ? [] : [...files];
    for (const file of incoming) {
      if (
        file.size > 10 * 1024 * 1024 ||
        !["image/jpeg", "image/png", "image/webp"].includes(file.type)
      ) {
        setError("JPEG·PNG·WebP, 사진당 10MB 이하로 선택해 주세요.");
        return;
      }
      if (
        !next.some(
          (f) =>
            f.name === file.name &&
            f.size === file.size &&
            f.lastModified === file.lastModified,
        )
      )
        next.push(file);
    }
    if (next.length > max) {
      setError(`사진은 최대 ${max}장까지 선택해 주세요.`);
      return;
    }
    setIndex(next.length - 1);
    onChange(next);
  }
  function move(delta: number) {
    setIndex((selected + delta + previews.length) % previews.length);
  }
  return (
    <div className="min-w-0 text-left">
      <div className="mb-3 flex items-center gap-1.5 text-xs sm:text-sm">
        <span className="font-medium">{title}</span>
        {max === 1 && (
          <span className="text-[10px] font-normal text-muted">선택</span>
        )}
      </div>
      <fieldset
        aria-label={`${label} 업로드`}
        className={`photo-picker relative overflow-hidden rounded-2xl border border-line bg-surface ${disabled ? "opacity-50" : ""}`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          add(Array.from(event.dataTransfer.files));
        }}
      >
        <input
          ref={input}
          id={inputId}
          aria-label={label}
          type="file"
          multiple={max > 1}
          accept="image/jpeg,image/png,image/webp"
          disabled={disabled}
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            add(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
        {preview ? (
          <>
            <fieldset
              aria-label={`${label} 미리보기`}
              aria-roledescription="캐러셀"
              className="photo-picker-preview relative"
              onTouchStart={(event) => {
                touchStart.current = event.touches[0]?.clientX ?? null;
              }}
              onTouchEnd={(event) => {
                const end = event.changedTouches[0]?.clientX;
                if (
                  touchStart.current !== null &&
                  end !== undefined &&
                  Math.abs(end - touchStart.current) > 35 &&
                  previews.length > 1
                )
                  move(end < touchStart.current ? 1 : -1);
                touchStart.current = null;
              }}
            >
              <img
                src={preview.url}
                alt={`${label} 미리보기 ${selected + 1}`}
                className="absolute inset-0 size-full object-contain p-2"
              />
              <button
                type="button"
                aria-label={`${label} ${selected + 1}번 삭제`}
                disabled={disabled}
                onClick={() => {
                  onChange(files.filter((_, i) => i !== selected));
                  setIndex(Math.max(0, selected - 1));
                }}
                className="absolute top-2 right-2 grid size-7 place-items-center rounded-full bg-paper text-ink hover:bg-control"
              >
                <X size={14} />
              </button>
              {previews.length > 1 && (
                <div className="absolute inset-x-2 bottom-2 flex items-center justify-between">
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={`${label} 이전 사진`}
                    onClick={() => move(-1)}
                    className="grid size-7 place-items-center rounded-full bg-paper hover:bg-control"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span
                    role="status"
                    className="rounded-full bg-paper px-2 py-1 text-[10px] tabular-nums"
                  >
                    {selected + 1} / {previews.length}
                  </span>
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={`${label} 다음 사진`}
                    onClick={() => move(1)}
                    className="grid size-7 place-items-center rounded-full bg-paper hover:bg-control"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </fieldset>
            <button
              type="button"
              disabled={disabled || (max > 1 && files.length >= max)}
              onClick={() => input.current?.click()}
              className="flex min-h-10 w-full items-center justify-center gap-1.5 border-t border-line text-xs text-muted hover:bg-studio hover:text-ink disabled:cursor-default disabled:opacity-50"
            >
              <Plus size={13} />
              {max === 1
                ? "사진 바꾸기"
                : files.length >= max
                  ? `${max}장 선택됨`
                  : "사진 추가"}
            </button>
          </>
        ) : (
          <button
            type="button"
            aria-label={`${label} 추가`}
            disabled={disabled}
            onClick={() => input.current?.click()}
            className="flex min-h-[200px] w-full flex-col items-center justify-center gap-3 px-2 text-muted transition-colors hover:bg-studio hover:text-ink sm:min-h-[264px]"
          >
            <ImagePlus size={25} strokeWidth={1.5} aria-hidden="true" />
            <span className="text-xs">사진 추가</span>
          </button>
        )}
      </fieldset>
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
export default function ProductUploadForm({
  csrf,
  onDone,
  productId,
  remaining = 3,
}: {
  csrf: string;
  onDone: (product: ProductDto) => void;
  productId?: string;
  remaining?: number;
}) {
  const [files, setFiles] = useState<File[]>([]),
    [look, setLook] = useState<File[]>([]),
    [person, setPerson] = useState<File[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const hasReference = look.length > 0 || person.length > 0;
  async function submit() {
    setBusy(true);
    setError("");
    try {
      if (
        [...files, ...look, ...person].reduce((n, f) => n + f.size, 0) >
        30 * 1024 * 1024
      )
        throw new Error(
          "한 번에 등록하는 사진은 합계 30MB 이하로 선택해 주세요.",
        );
      const body = new FormData();
      for (const f of files) body.append("images", f);
      if (look[0]) body.set("lookImage", look[0]);
      if (person[0]) body.set("personImage", person[0]);
      if (hasReference) body.set("rightsConfirmed", "true");
      const product = await request<ProductDto>(
        productId ? `/api/v1/products/${productId}/assets` : "/api/v1/products",
        { method: "POST", body, signal: AbortSignal.timeout(90000) },
        csrf,
      );
      onDone(product);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="space-y-5"
      aria-label="상품 등록 폼"
    >
      <div
        className={
          !productId ? "grid grid-cols-3 items-start gap-3 sm:gap-5" : ""
        }
      >
        <PhotoPicker
          label="상품 사진"
          files={files}
          onChange={setFiles}
          max={remaining}
          disabled={busy}
        />
        {!productId && (
          <>
            <PhotoPicker
              label="촬영 레퍼런스 (선택)"
              files={look}
              onChange={setLook}
              max={1}
              disabled={busy}
            />
            <PhotoPicker
              label="인물 참조 (선택)"
              files={person}
              onChange={setPerson}
              max={1}
              disabled={busy}
            />
          </>
        )}
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-danger-surface p-3 text-sm text-danger"
        >
          {error}
        </p>
      )}
      <Button
        type="submit"
        aria-label={productId ? "사진 추가" : "상품 추가"}
        className={productId ? "w-full" : "mx-auto min-w-36"}
        disabled={busy || files.length === 0}
      >
        {busy ? (
          <LoaderCircle size={17} className="motion-safe:animate-spin" />
        ) : (
          <ArrowUpRight size={17} />
        )}{" "}
        {busy
          ? "사진을 안전하게 저장하고 있어요"
          : productId
            ? "사진 추가"
            : "추가"}
      </Button>
    </form>
  );
}
