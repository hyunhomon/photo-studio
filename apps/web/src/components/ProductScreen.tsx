import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Button, Modal } from "@photo-studio/ui";
import type { ProductDto, PipelineDto } from "@photo-studio/schemas";
import { useAccount } from "../lib/account";
import { apiBase, errorMessage, request } from "../lib/api";
import WorkspaceShell from "./WorkspaceShell";
import UploadDialog from "./UploadDialog";
import PlanningPanel from "./PlanningPanel";
import GenerationPanel from "./GenerationPanel";

export default function ProductScreen({ id }: { id: string }) {
  const { me, error, setError } = useAccount();
  const [product, setProduct] = useState<ProductDto | null>(null);
  const [pipeline, setPipeline] = useState<PipelineDto>({
    plans: [],
    jobs: [],
  });
  const [upload, setUpload] = useState(false),
    [remove, setRemove] = useState(false),
    [busy, setBusy] = useState(false);
  const refresh = useCallback(() => {
    if (me)
      void request<ProductDto>(`/api/v1/products/${id}`)
        .then(setProduct)
        .catch((e) => setError(errorMessage(e)));
  }, [me, id, setError]);
  useEffect(refresh, [refresh]);
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
          <div className="mt-8 grid items-start gap-7 xl:grid-cols-[minmax(240px,0.65fr)_1fr]">
            <section className="rounded-panel border border-line bg-surface p-6 xl:sticky xl:top-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg">원본 참조</h2>
                {!product.analysis &&
                  product.assets.filter((a) => a.kind === "input").length <
                    3 && (
                    <Button variant="secondary" onClick={() => setUpload(true)}>
                      <Plus size={14} aria-hidden="true" />
                      사진 추가
                    </Button>
                  )}
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {product.assets
                  .filter((a) => a.kind === "input")
                  .map((asset) => (
                    <img
                      key={asset.id}
                      src={`${apiBase}/api/v1/assets/${asset.id}/content`}
                      alt={`${product.name} 참조`}
                      className="aspect-[3/4] w-full rounded-xl bg-studio object-contain"
                    />
                  ))}
              </div>
            </section>
            {me && (
              <PlanningPanel
                product={product}
                me={me}
                onRefresh={refresh}
                onPipeline={setPipeline}
              />
            )}
          </div>
          {me && (
            <GenerationPanel
              product={product}
              me={me}
              pipeline={pipeline}
              onRefresh={refresh}
            />
          )}
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
