import { useEffect, useId, useState } from "react";
import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
} from "@headlessui/react";
import {
  ImagePlus,
  X,
  ChevronDown,
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
  const [previews, setPreviews] = useState<{ url: string; name: string }[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    const list = files.map((f) => ({
      url: URL.createObjectURL(f),
      name: f.name,
    }));
    setPreviews(list);
    return () => {
      for (const p of list) URL.revokeObjectURL(p.url);
    };
  }, [files]);
  function add(incoming: File[]) {
    setError("");
    const next = [...files];
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
    onChange(next);
  }
  return (
    <div>
      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!disabled) add(Array.from(e.dataTransfer.files));
        }}
        className={`relative flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-control bg-paper/50 p-5 text-center transition-colors hover:border-primary focus-within:outline-2 focus-within:outline-primary ${disabled ? "opacity-50" : ""}`}
      >
        <ImagePlus size={25} className="text-primary" aria-hidden="true" />
        <span className="mt-3 text-sm font-semibold">{label}</span>
        <span className="mt-1.5 text-xs text-muted">
          끌어 놓거나 클릭 · 최대 {max}장
        </span>
        <input
          aria-label={label}
          type="file"
          multiple={max > 1}
          accept="image/jpeg,image/png,image/webp"
          disabled={disabled}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
          onChange={(e) => {
            add(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </label>
      {previews.length > 0 && (
        <div
          className={`mt-3 grid gap-3 ${max > 1 ? "grid-cols-3" : "grid-cols-1"}`}
        >
          {previews.map((p, i) => (
            <figure
              key={p.url}
              className="relative min-w-0 overflow-hidden rounded-xl border border-line bg-paper"
            >
              <img
                src={p.url}
                alt={`${label} 미리보기 ${i + 1}`}
                className="aspect-square max-h-44 w-full object-contain"
              />
              <button
                type="button"
                aria-label={`${label} ${i + 1}번 삭제`}
                disabled={disabled}
                onClick={() =>
                  onChange(files.filter((_, index) => index !== i))
                }
                className="absolute top-2 right-2 grid size-7 place-items-center rounded-full border border-line bg-paper/90"
              >
                <X size={14} />
              </button>
              <figcaption className="truncate px-2.5 py-2 text-[10px] text-muted">
                {max > 1 && i === 0 ? "대표 · " : ""}
                {p.name}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
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
  const nameId = useId();
  const [name, setName] = useState(""),
    [files, setFiles] = useState<File[]>([]),
    [look, setLook] = useState<File[]>([]),
    [person, setPerson] = useState<File[]>([]),
    [rights, setRights] = useState(false),
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
      body.set(
        "name",
        name.trim() ||
          files[0]?.name.replace(/\.[^.]+$/, "").slice(0, 120) ||
          "새 상품",
      );
      for (const f of files) body.append("images", f);
      if (look[0]) body.set("lookImage", look[0]);
      if (person[0]) body.set("personImage", person[0]);
      if (hasReference) body.set("rightsConfirmed", String(rights));
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
      {!productId && (
        <label
          className="block text-xs font-medium text-muted"
          htmlFor={nameId}
        >
          상품 이름{" "}
          <span className="font-normal">· 비워두면 사진 이름으로 저장해요</span>
          <input
            id={nameId}
            className="studio-input mt-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            placeholder="예: 워시드 코튼 집업"
            disabled={busy}
          />
        </label>
      )}
      <div
        className={
          !productId ? "grid items-start gap-5 sm:grid-cols-[1.4fr_1fr]" : ""
        }
      >
        <div>
          <PhotoPicker
            label="상품 사진"
            files={files}
            onChange={setFiles}
            max={remaining}
            disabled={busy}
          />
          <p className="mt-2 text-[11px] leading-5 text-muted">
            정면·후면·디테일을 함께 넣어 주세요.
            <br />
            JPEG/PNG/WebP · 사진당 10MB · 4MP · 긴 변 4096px
          </p>
        </div>
        {!productId && (
          <div>
            <PhotoPicker
              label="촬영 레퍼런스 (선택)"
              files={look}
              onChange={setLook}
              max={1}
              disabled={busy}
            />
            <p className="mt-2 text-[11px] leading-5 text-muted">
              원하는 구도·빛·분위기를 기획에 반영하고, 생성할 때도 함께 사용할
              수 있어요.
            </p>
          </div>
        )}
      </div>
      {!productId && (
        <Disclosure>
          <DisclosureButton className="flex w-full items-center justify-between rounded-xl bg-paper/60 px-4 py-3 text-xs text-muted">
            특정 모델의 인상을 참고하고 싶다면
            <ChevronDown size={14} />
          </DisclosureButton>
          <DisclosurePanel className="pt-3">
            <PhotoPicker
              label="인물 참조 (선택)"
              files={person}
              onChange={setPerson}
              max={1}
              disabled={busy}
            />
          </DisclosurePanel>
        </Disclosure>
      )}
      {hasReference && (
        <label className="flex items-start gap-3 text-xs leading-6 text-muted">
          <input
            type="checkbox"
            className="mt-1 size-4 shrink-0 accent-primary"
            checked={rights}
            onChange={(e) => setRights(e.target.checked)}
          />
          참조 사진의 사용 권한과 성인 인물의 사용 동의를 확인했습니다. 선택한
          참조는 이후 AI 실행에 동의할 때 OpenRouter와 모델 제공사로 전송됩니다.
        </label>
      )}
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
        className="w-full"
        disabled={busy || files.length === 0 || (hasReference && !rights)}
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
            : "상품 등록"}
      </Button>
      <p className="text-center text-[11px] leading-5 text-muted">
        비공개로 저장해요. 등록만으로 AI를 호출하거나 비용을 청구하지 않아요.
      </p>
    </form>
  );
}
