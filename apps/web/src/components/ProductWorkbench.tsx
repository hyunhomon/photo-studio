import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@photo-studio/ui";
import type {
  ProductDto,
  PipelineDto,
  StudioDraft,
} from "@photo-studio/schemas";
import { useAccount } from "../lib/account";
import { ApiError, errorMessage, request } from "../lib/api";
import WorkspaceShell from "./WorkspaceShell";
import WorkspaceSkeleton from "./WorkspaceSkeleton";
import PlanningPanel from "./PlanningPanel";
import GenerationPanel from "./GenerationPanel";
import PhotoReferences from "./PhotoReferences";
import UploadDialog from "./UploadDialog";

export default function ProductWorkbench({ id }: { id: string }) {
  const { me, error, state, retry } = useAccount();
  const [product, setProduct] = useState<ProductDto | null>(null),
    [pipeline, setPipeline] = useState<PipelineDto>({ plans: [], jobs: [] }),
    [upload, setUpload] = useState(false);
  const [draft, setDraft] = useState<StudioDraft>({});
  const [requestBusy, setRequestBusy] = useState(false);
  const [loadError, setLoadError] = useState<{
    message: string;
    notFound: boolean;
  } | null>(null);
  const refreshSequence = useRef(0);
  const refresh = useCallback(() => {
    if (!me) return;
    const sequence = ++refreshSequence.current;
    setLoadError(null);
    void request<ProductDto>(`/api/v1/products/${id}`)
      .then((data) => {
        if (sequence === refreshSequence.current) setProduct(data);
      })
      .catch((e) => {
        if (sequence === refreshSequence.current)
          setLoadError({
            message: errorMessage(e),
            notFound: e instanceof ApiError && e.status === 404,
          });
      });
  }, [me, id]);
  useEffect(() => {
    refresh();
    return () => {
      refreshSequence.current++;
    };
  }, [refresh]);
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
      error={error || (product ? loadError?.message : "")}
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
            <GenerationPanel
              product={product}
              onAddOriginal={() => setUpload(true)}
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
              // A read started before this upload cannot remove its new photo.
              refreshSequence.current++;
              setProduct(p);
              setLoadError(null);
              setUpload(false);
            }}
          />
        </div>
      ) : loadError ? (
        <section className="mx-auto flex min-h-[55dvh] max-w-lg flex-col items-center justify-center px-5 text-center">
          <h1 className="text-xl">
            {loadError.notFound
              ? "상품을 찾을 수 없어요."
              : "상품을 불러오지 못했어요."}
          </h1>
          <p role="alert" className="mt-3 text-sm leading-7 text-muted">
            {loadError.notFound
              ? "삭제되었거나 접근할 수 없는 상품입니다."
              : "연결을 확인하고 다시 불러와 주세요."}
          </p>
          <div className="mt-6 flex items-center gap-5">
            <Button variant="secondary" onClick={refresh}>
              다시 불러오기
            </Button>
            <a href="/studio" className="text-sm text-muted hover:text-ink">
              새 상품
            </a>
          </div>
        </section>
      ) : (
        <WorkspaceSkeleton label="상품을 불러오고 있습니다" />
      )}
    </WorkspaceShell>
  );
}
