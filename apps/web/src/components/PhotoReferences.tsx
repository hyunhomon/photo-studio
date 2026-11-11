import { useState } from "react";
import { Button, Modal } from "@photo-studio/ui";
import { ImagePlus, Trash2 } from "lucide-react";
import type {
  AssetDto,
  ProductDto,
  ReferenceRole,
} from "@photo-studio/schemas";
import { apiBase, errorMessage, request } from "../lib/api";

const roles = [
  {
    value: "person_reference",
    title: "인물 참조",
    button: "인물 사진 등록",
    description:
      "사용 동의를 받은 성인 모델의 얼굴·인상을 참조합니다. 의상과 배경은 따라 하지 않습니다.",
  },
  {
    value: "look_reference",
    title: "촬영감 참조",
    button: "촬영감 사진 등록",
    description:
      "원하는 톤·명암·선예도·질감의 기준입니다. 사진 속 얼굴과 의류를 복제하는 용도가 아닙니다.",
  },
] as const;
export default function PhotoReferences({
  product,
  csrf,
  active,
  onRefresh,
}: {
  product: ProductDto;
  csrf: string;
  active: boolean;
  onRefresh: () => void;
}) {
  const [role, setRole] = useState<ReferenceRole | null>(null),
    [file, setFile] = useState<File | null>(null),
    [rights, setRights] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [remove, setRemove] = useState<AssetDto | null>(null);
  const info = roles.find((r) => r.value === role);
  async function upload() {
    if (!file || !role || !rights) return;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.set("role", role);
      body.set("rightsConfirmed", "true");
      body.set("image", file);
      await request(
        `/api/v1/products/${product.id}/references`,
        { method: "POST", body, signal: AbortSignal.timeout(60000) },
        csrf,
      );
      setRole(null);
      setFile(null);
      setRights(false);
      onRefresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function drop() {
    if (!remove) return;
    setBusy(true);
    setError("");
    try {
      await request(`/api/v1/assets/${remove.id}`, { method: "DELETE" }, csrf);
      setRemove(null);
      onRefresh();
    } catch (e) {
      setError(errorMessage(e));
      onRefresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      aria-label="촬영 참조"
      className="mt-7 rounded-panel border border-line bg-surface p-6"
    >
      <h2 className="text-lg">
        촬영 참조{" "}
        <span className="ml-2 text-xs font-normal text-muted">선택 사항</span>
      </h2>
      <p className="mt-3 text-xs leading-6 text-muted">
        의류 원본과 역할을 나누어 보관합니다. 업로드만으로 AI를 호출하지 않으며,
        생성할 때 사용할 사진과 외부 처리를 확인합니다. 참조가 얼굴 보존이나
        실사 품질을 보장하지는 않습니다.
      </p>
      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-danger-surface p-3 text-sm text-danger"
        >
          {error}
        </p>
      )}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {roles.map((r) => {
          const asset = product.assets.find((a) => a.kind === r.value);
          return (
            <div
              key={r.value}
              className="rounded-xl border border-line bg-studio p-4"
            >
              <h3 className="font-semibold">{r.title}</h3>
              <p className="mt-2 text-xs leading-6 text-muted">
                {r.description}
              </p>
              {asset ? (
                <div className="mt-4 flex items-start gap-4">
                  <img
                    src={`${apiBase}/api/v1/assets/${asset.id}/content`}
                    alt={`${r.title} 사진`}
                    className="h-28 w-24 rounded-lg object-contain"
                  />
                  <Button
                    variant="secondary"
                    aria-label={`${r.title} 사진 삭제`}
                    disabled={active || busy}
                    onClick={() => setRemove(asset)}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </Button>
                </div>
              ) : (
                <Button
                  className="mt-4"
                  variant="secondary"
                  disabled={active || busy}
                  onClick={() => {
                    setRole(r.value);
                    setFile(null);
                    setRights(false);
                    setError("");
                  }}
                >
                  <ImagePlus size={15} aria-hidden="true" />
                  {r.button}
                </Button>
              )}
            </div>
          );
        })}
      </div>
      <Modal
        open={Boolean(role)}
        onClose={() => {
          if (!busy) setRole(null);
        }}
        title={info?.button ?? "참조 사진 등록"}
        description={info?.description ?? ""}
      >
        <form
          className="mt-5 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void upload();
          }}
        >
          <label className="relative flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-control bg-studio p-5 text-center focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-primary">
            <ImagePlus size={24} aria-hidden="true" />
            <span className="mt-3 text-xs font-semibold">
              {file ? file.name : `${info?.title} 사진 선택`}
            </span>
            <input
              aria-label={`${info?.title} 사진 선택`}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required
              disabled={busy}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <p className="text-xs leading-6 text-muted">
            JPEG/PNG/WebP 한 장 · 10MB · 400만 픽셀 · 긴 변 4096px 이하. 사진은
            비공개 저장됩니다. 실제 생성에서 선택하면 OpenRouter와 모델 제공사에
            전달됩니다.
          </p>
          <label className="flex items-start gap-3 text-sm leading-6">
            <input
              type="checkbox"
              className="mt-1 size-4 accent-primary"
              checked={rights}
              onChange={(e) => setRights(e.target.checked)}
            />
            {role === "person_reference"
              ? "사진의 사용 권한과 성인 모델의 사용 동의를 확인했습니다."
              : "AI 참조로 사용할 권한이 있는 사진임을 확인했습니다."}
          </label>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <Button
            type="submit"
            className="w-full"
            disabled={!file || !rights || busy || active}
          >
            {busy ? "사진을 저장하고 있습니다" : "비공개로 사진 저장"}
          </Button>
        </form>
      </Modal>
      <Modal
        open={Boolean(remove)}
        onClose={() => {
          if (!busy) setRemove(null);
        }}
        title="참조 사진을 삭제할까요?"
        description="업로드한 참조 원본을 삭제합니다. 이미 생성된 결과 사진은 남으며 상품 또는 프로젝트 삭제에서 함께 지울 수 있습니다."
      >
        <div className="mt-5 flex gap-3">
          <Button
            variant="secondary"
            onClick={() => setRemove(null)}
            disabled={busy}
          >
            취소
          </Button>
          <Button
            variant="danger"
            onClick={() => void drop()}
            disabled={busy || active}
          >
            참조 사진 영구 삭제
          </Button>
        </div>
      </Modal>
    </section>
  );
}
