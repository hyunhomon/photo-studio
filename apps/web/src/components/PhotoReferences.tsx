import { useState } from "react";
import { Button, Modal } from "@photo-studio/ui";
import { ImagePlus, Trash2 } from "lucide-react";
import type {
  AssetDto,
  ProductDto,
  ReferenceRole,
} from "@photo-studio/schemas";
import { apiBase, errorMessage, request } from "../lib/api";
import { PhotoPicker } from "./ProductUploadForm";

const roles = [
  {
    value: "person_reference",
    title: "인물 참조",
    button: "인물 사진 등록",
  },
  {
    value: "look_reference",
    title: "촬영감 참조",
    button: "촬영감 사진 등록",
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
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [remove, setRemove] = useState<AssetDto | null>(null);
  const [sourcePinUrl, setSourcePinUrl] = useState("");
  const info = roles.find((r) => r.value === role);
  async function upload() {
    if (!file || !role) return;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.set("role", role);
      body.set("rightsConfirmed", "true");
      body.set("image", file);
      if (role === "look_reference" && sourcePinUrl.trim())
        body.set("sourcePinUrl", sourcePinUrl.trim());
      await request(
        `/api/v1/products/${product.id}/references`,
        { method: "POST", body, signal: AbortSignal.timeout(60000) },
        csrf,
      );
      setRole(null);
      setFile(null);
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
      className="mt-5 rounded-panel border border-line bg-surface p-4"
    >
      <h2 className="text-lg">
        촬영 참조{" "}
        <span className="ml-2 text-xs font-normal text-muted">선택 사항</span>
      </h2>
      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-danger-surface p-3 text-sm text-danger"
        >
          {error}
        </p>
      )}
      <div className="mt-4 grid gap-3">
        {roles.map((r) => {
          const asset = product.assets.find((a) => a.kind === r.value);
          return (
            <div
              key={r.value}
              className="rounded-xl border border-line bg-studio p-4"
            >
              <h3 className="font-semibold">{r.title}</h3>
              {asset ? (
                <div className="group relative mt-4 w-fit">
                  <img
                    src={`${apiBase}/api/v1/assets/${asset.id}/content`}
                    alt={`${r.title} 사진`}
                    className="h-28 w-24 rounded-lg object-contain"
                  />
                  <button
                    type="button"
                    className="media-hover-action absolute top-1 right-1 grid size-8 place-items-center rounded-lg bg-surface opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                    aria-label={`${r.title} 사진 삭제`}
                    disabled={active || busy}
                    onClick={() => setRemove(asset)}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                  {asset.sourcePinUrl && (
                    <a
                      href={asset.sourcePinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 block text-xs text-muted underline"
                    >
                      핀 출처
                    </a>
                  )}
                </div>
              ) : (
                <Button
                  className="mt-4"
                  variant="secondary"
                  disabled={active || busy}
                  onClick={() => {
                    setRole(r.value);
                    setFile(null);
                    setSourcePinUrl("");
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
        description={
          role === "look_reference"
            ? "사용권 있는 실제 촬영 원본을 등록해 주세요. 사진은 기획과 생성의 시각 참조로 사용합니다."
            : ""
        }
      >
        <form
          className="mt-5 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void upload();
          }}
        >
          <PhotoPicker
            label={`${info?.title} 사진 선택`}
            files={file ? [file] : []}
            onChange={(files) => setFile(files[0] ?? null)}
            max={1}
            disabled={busy}
          />
          {role === "look_reference" && (
            <label className="block text-xs text-muted">
              핀 출처 (선택)
              <input
                type="url"
                className="studio-input mt-2"
                placeholder="https://www.pinterest.com/pin/…/"
                value={sourcePinUrl}
                maxLength={300}
                onChange={(e) => setSourcePinUrl(e.target.value)}
                disabled={busy}
              />
            </label>
          )}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <Button
            type="submit"
            className="w-full"
            disabled={!file || busy || active}
          >
            {busy ? "사진을 저장하고 있습니다" : "사진 저장"}
          </Button>
        </form>
      </Modal>
      <Modal
        open={Boolean(remove)}
        onClose={() => {
          if (!busy) setRemove(null);
        }}
        title="참조 사진을 삭제할까요?"
        description="업로드한 참조 원본을 삭제합니다. 이미 생성된 결과 사진은 남으며 상품 삭제에서 함께 지울 수 있습니다."
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
            variant="primary"
            onClick={() => void drop()}
            disabled={busy || active}
          >
            삭제
          </Button>
        </div>
      </Modal>
    </section>
  );
}
