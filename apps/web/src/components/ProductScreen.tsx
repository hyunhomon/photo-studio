import { useEffect, useState } from "react";
import { ArrowLeft, Plus, Trash2, ScanSearch } from "lucide-react";
import { Button, Modal } from "@photo-studio/ui";
import type { ProductDto } from "@photo-studio/schemas";
import { useAccount } from "../lib/account";
import { apiBase, errorMessage, request } from "../lib/api";
import WorkspaceShell from "./WorkspaceShell";
import UploadDialog from "./UploadDialog";

export default function ProductScreen({ id }: { id: string }) {
  const { me, error, setError } = useAccount();
  const [product, setProduct] = useState<ProductDto | null>(null);
  const [upload, setUpload] = useState(false),
    [remove, setRemove] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (me)
      request<ProductDto>(`/api/v1/products/${id}`)
        .then(setProduct)
        .catch((e) => setError(errorMessage(e)));
  }, [me, id, setError]);
  async function drop() {
    if (!me || !product) return;
    setBusy(true);
    try {
      await request(`/api/v1/products/${id}`, { method: "DELETE" }, me.csrf);
      location.assign(`/studio/projects/${product.projectId}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <WorkspaceShell me={me} error={error}>
      {product ? (
        <>
          <a
            href={`/studio/projects/${product.projectId}`}
            className="mb-6 flex items-center gap-2 text-xs text-muted"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            프로젝트
          </a>
          <div className="flex items-end justify-between gap-5">
            <div>
              <p className="eyebrow text-muted">THE GARMENT / ORIGINAL</p>
              <h1 className="mt-3 text-3xl">{product.name}</h1>
              <p className="mt-4 text-sm leading-7 text-muted">
                비공개로 보관한 상품 사진입니다.
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => setRemove(true)}
              aria-label="상품 삭제"
            >
              <Trash2 size={16} aria-hidden="true" />
            </Button>
          </div>
          <div className="mt-8 grid gap-7 lg:grid-cols-[1.4fr_1fr]">
            <section className="rounded-panel border border-line bg-surface p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg">원본 참조</h2>
                {product.assets.length < 3 && (
                  <Button variant="secondary" onClick={() => setUpload(true)}>
                    <Plus size={14} aria-hidden="true" />
                    사진 추가
                  </Button>
                )}
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {product.assets.map((asset) => (
                  <img
                    key={asset.id}
                    src={`${apiBase}/api/v1/assets/${asset.id}/content`}
                    alt={`${product.name} 참조`}
                    className="aspect-[3/4] w-full rounded-xl bg-studio object-contain"
                  />
                ))}
              </div>
            </section>
            <section className="rounded-panel border border-line p-7">
              <ScanSearch size={24} aria-hidden="true" />
              <h2 className="mt-5 text-xl">촬영 전, 상품을 이해합니다.</h2>
              <p className="mt-4 text-sm leading-8 text-muted">
                색상·실루엣·로고처럼 보존할 부분을 먼저 확인합니다. 업로드는
                AI를 실행하지 않았습니다. 분석과 촬영 기획 연결을 준비하고
                있습니다.
              </p>
            </section>
          </div>
          {me && (
            <UploadDialog
              open={upload}
              onClose={() => setUpload(false)}
              productId={id}
              csrf={me.csrf}
              onDone={(p) => {
                setProduct(p);
                setUpload(false);
              }}
            />
          )}
          <Modal
            open={remove}
            onClose={() => setRemove(false)}
            title="상품을 삭제할까요?"
            description="이 상품의 원본과 결과 사진, 촬영 계획 및 작업 기록을 영구 삭제합니다."
          >
            <div className="mt-6 flex gap-3">
              <Button variant="secondary" onClick={() => setRemove(false)}>
                취소
              </Button>
              <Button onClick={() => void drop()} disabled={busy}>
                상품 영구 삭제
              </Button>
            </div>
          </Modal>
        </>
      ) : (
        <p role="status" className="py-12 text-sm text-muted">
          상품을 불러오고 있습니다…
        </p>
      )}
    </WorkspaceShell>
  );
}
