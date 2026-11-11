import { useCallback, useEffect, useState } from "react";
import { navigate } from "astro:transitions/client";
import { Plus, Trash2 } from "lucide-react";
import { Button, Modal } from "@photo-studio/ui";
import type { ProductDto, PipelineDto } from "@photo-studio/schemas";
import { useAccount } from "../lib/account";
import { errorMessage, request } from "../lib/api";
import WorkspaceShell from "./WorkspaceShell";
import WorkspaceSkeleton from "./WorkspaceSkeleton";
import PlanningPanel from "./PlanningPanel";
import GenerationPanel from "./GenerationPanel";
import PhotoReferences from "./PhotoReferences";
import UploadDialog from "./UploadDialog";

export default function ProductWorkbench({ id }: { id: string }) {
  const { me, error, setError, state, retry } = useAccount();
  const [product, setProduct] = useState<ProductDto | null>(null),
    [pipeline, setPipeline] = useState<PipelineDto>({ plans: [], jobs: [] }),
    [upload, setUpload] = useState(false),
    [remove, setRemove] = useState(false),
    [busy, setBusy] = useState(false);
  const refresh = useCallback(() => {
    if (me)
      void request<ProductDto>(`/api/v1/products/${id}`)
        .then(setProduct)
        .catch((e) => setError(errorMessage(e)));
  }, [me, id, setError]);
  useEffect(refresh, [refresh]);
  const active = pipeline.jobs.some((j) =>
    ["queued", "running"].includes(j.status),
  );
  const inputs = product?.assets.filter((a) => a.kind === "input") ?? [];
  async function drop() {
    if (!me) return;
    setBusy(true);
    try {
      await request(`/api/v1/products/${id}`, { method: "DELETE" }, me.csrf);
      await navigate("/studio");
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <WorkspaceShell
      me={me}
      error={error}
      accountState={state}
      onRetry={retry}
      activeProductId={id}
      title={product?.name}
      workbench
    >
      {product && me ? (
        <div className="studio-workbench">
          <div className="workbench-canvas">
            <h1 className="sr-only">{product.name}</h1>
            <div className="mb-4 flex shrink-0 items-center gap-3">
              <span className="text-xs text-muted">
                의류 원본 {inputs.length}장
              </span>
              {!product.analysis &&
                pipeline.jobs.length === 0 &&
                inputs.length < 3 && (
                  <Button variant="secondary" onClick={() => setUpload(true)}>
                    <Plus size={14} />
                    원본 추가
                  </Button>
                )}
              <Button
                className="ml-auto"
                variant="secondary"
                aria-label="상품 삭제"
                onClick={() => setRemove(true)}
              >
                <Trash2 size={15} />
              </Button>
            </div>
            <GenerationPanel
              product={product}
              me={me}
              pipeline={pipeline}
              onRefresh={refresh}
            />
          </div>
          <aside className="workbench-inspector" aria-label="촬영 설정 패널">
            <PlanningPanel
              product={product}
              me={me}
              onRefresh={refresh}
              onPipeline={setPipeline}
              referencesPanel={
                <PhotoReferences
                  product={product}
                  csrf={me.csrf}
                  active={active}
                  onRefresh={refresh}
                />
              }
            />
          </aside>
          <UploadDialog
            open={upload}
            onClose={() => setUpload(false)}
            productId={id}
            remaining={3 - inputs.length}
            csrf={me.csrf}
            onDone={(p) => {
              setProduct(p);
              setUpload(false);
            }}
          />
          <Modal
            open={remove}
            onClose={() => setRemove(false)}
            title="상품을 삭제할까요?"
            description="의류와 참조 사진, 생성 결과와 작업 기록을 모두 삭제합니다."
          >
            <div className="mt-5 flex gap-3">
              <Button variant="secondary" onClick={() => setRemove(false)}>
                취소
              </Button>
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => void drop()}
              >
                상품 영구 삭제
              </Button>
            </div>
          </Modal>
        </div>
      ) : (
        <WorkspaceSkeleton label="상품을 불러오고 있습니다" />
      )}
    </WorkspaceShell>
  );
}
