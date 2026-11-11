import { useState } from "react";
import { Button, Modal } from "@photo-studio/ui";
import { Upload, ImagePlus } from "lucide-react";
import type { ProductDto } from "@photo-studio/schemas";
import { errorMessage, request } from "../lib/api";

export default function UploadDialog({
  open,
  onClose,
  projectId,
  productId,
  csrf,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  projectId?: string;
  productId?: string;
  csrf: string;
  onDone: (product: ProductDto) => void;
}) {
  const [name, setName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function upload() {
    setBusy(true);
    setError("");
    try {
      if (
        !files.length ||
        files.length > 3 ||
        files.some((file) => file.size > 10 * 1024 * 1024)
      )
        throw new Error("사진은 최대 3장, 한 장당 10MB까지 선택해 주세요.");
      const body = new FormData();
      body.set("name", name.trim());
      for (const file of files) body.append("images", file);
      const product = await request<ProductDto>(
        productId
          ? `/api/v1/products/${productId}/assets`
          : `/api/v1/projects/${projectId}/products`,
        { method: "POST", body, signal: AbortSignal.timeout(60000) },
        csrf,
      );
      setFiles([]);
      setName("");
      onDone(product);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={productId ? "참조 사진 추가" : "새 상품 등록"}
      description="정면 사진 한 장으로 시작할 수 있습니다. 후면과 디테일은 선택해 주세요. 업로드만으로 AI를 실행하지 않습니다."
    >
      <form
        className="mt-6 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void upload();
        }}
      >
        {!productId && (
          <div>
            <label
              className="mb-2 block text-xs font-semibold"
              htmlFor="product-name"
            >
              상품 이름
            </label>
            <input
              id="product-name"
              className="studio-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              required
              placeholder="예: 린넨 오버핏 셔츠"
            />
          </div>
        )}
        <label className="relative flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-line bg-paper p-6 text-center focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-primary">
          <ImagePlus size={28} strokeWidth={1.5} aria-hidden="true" />
          <span className="mt-4 text-sm font-semibold">
            클릭하거나 사진을 여기에 놓으세요
          </span>
          <span className="mt-2 text-[11px] leading-5 text-muted">
            JPEG · PNG · WebP / 최대 3장
            <br />한 장당 10MB · 400만 픽셀 · 긴 변 4096px 이하
          </span>
          <input
            aria-label="상품 사진"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            disabled={busy}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </label>
        {files.length > 0 && (
          <p role="status" className="text-xs text-muted">
            사진 {files.length}장 선택 ·{" "}
            {(
              files.reduce((sum, file) => sum + file.size, 0) /
              1024 /
              1024
            ).toFixed(1)}
            MB
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <p className="text-[11px] leading-5 text-muted">
          소재와 작은 로고가 보이도록 긴 변 1024px 이상인 선명한 원본을
          권장합니다. 정면 사진과 로고·원단을 가까이 찍은 상세 사진을 함께
          넣으면 근거를 보강할 수 있습니다. 이 권장 크기가 보존 정확도를
          보장하지는 않습니다.
        </p>
        <p className="text-[11px] leading-5 text-muted">
          사진은 비공개로 보관하고 위치·카메라 등 부가 메타데이터를 제거합니다.
          권리를 보유한 사진만 등록해 주세요.
        </p>
        <Button
          type="submit"
          className="w-full"
          disabled={busy || !files.length || (!productId && !name.trim())}
        >
          <Upload size={16} aria-hidden="true" />
          {busy ? "사진을 확인하고 저장하는 중…" : "비공개로 상품 등록"}
        </Button>
      </form>
    </Modal>
  );
}
