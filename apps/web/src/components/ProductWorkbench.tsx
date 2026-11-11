import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@photo-studio/ui";
import type {
  ProductDto,
  PipelineDto,
  StudioDraft,
} from "@photo-studio/schemas";
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
    [upload, setUpload] = useState(false);
  const [draft, setDraft] = useState<StudioDraft>({});
  const [requestBusy, setRequestBusy] = useState(false);
  const refresh = useCallback(() => {
    if (me)
      void request<ProductDto>(`/api/v1/products/${id}`)
        .then(setProduct)
        .catch((e) => setError(errorMessage(e)));
  }, [me, id, setError]);
  useEffect(refresh, [refresh]);
  const active =
    requestBusy ||
    pipeline.jobs.some((j) => ["queued", "running"].includes(j.status));
  const effectiveDraft = {
    ...draft,
    analysis:
      draft.analysisBase === JSON.stringify(product?.analysis)
        ? draft.analysis
        : undefined,
  };
  const inputs = product?.assets.filter((a) => a.kind === "input") ?? [];
  useEffect(() => {
    window.addEventListener("studio:product-changed", refresh);
    return () => window.removeEventListener("studio:product-changed", refresh);
  }, [refresh]);
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
            <div className="flex shrink-0 items-center gap-3 empty:hidden">
              {!product.analysis &&
                pipeline.jobs.length === 0 &&
                inputs.length < 3 && (
                  <Button variant="secondary" onClick={() => setUpload(true)}>
                    <Plus size={14} />
                    원본 추가
                  </Button>
                )}
            </div>
            <GenerationPanel
              product={product}
              me={me}
              pipeline={pipeline}
              draft={effectiveDraft}
              onBusy={setRequestBusy}
              onQueued={(job) =>
                setPipeline((current) => ({
                  ...current,
                  jobs: [job, ...current.jobs.filter((j) => j.id !== job.id)],
                }))
              }
              onRefresh={refresh}
            />
          </div>
          <aside className="workbench-inspector" aria-label="촬영 설정 패널">
            <PlanningPanel
              product={product}
              me={me}
              onRefresh={refresh}
              onPipeline={setPipeline}
              draft={effectiveDraft}
              onDraft={setDraft}
              executionPending={active}
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
        </div>
      ) : (
        <WorkspaceSkeleton label="상품을 불러오고 있습니다" />
      )}
    </WorkspaceShell>
  );
}
