import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ImagePlus, RotateCcw } from "lucide-react";
import { Button, Modal, Select } from "@photo-studio/ui";
import type {
  JobDto,
  PipelineDto,
  ProductDto,
  ResultDto,
  StudioDraft,
} from "@photo-studio/schemas";
import { apiBase, errorMessage, type Me, request } from "../lib/api";
import WorkPending from "./WorkPending";
import PhotoFrame from "./PhotoFrame";
import ImageViewer from "./ImageViewer";
import { Field, JobStatus } from "./PlanningPanel";
export const reasons = [
  { value: "lighting_focus", label: "빛과 초점 · 배경과의 연결" },
  { value: "human_naturalness", label: "인물 · 얼굴과 자세의 자연스러움" },
  { value: "material_rendering", label: "소재 · 옷감과 주변 표면" },
  { value: "color_change", label: "원본과 색상이 달라요" },
  { value: "logo_distortion", label: "로고·텍스트가 왜곡됐어요" },
  { value: "pattern_change", label: "패턴이 달라요" },
  { value: "silhouette_change", label: "핏·길이·형태가 달라요" },
  { value: "missing_detail", label: "단추 등 디테일이 빠졌어요" },
  { value: "unrealistic", label: "모델·이미지가 부자연스러워요" },
  { value: "composition", label: "구도·배경을 바꾸고 싶어요" },
  { value: "other", label: "다른 이유" },
];
export default function GenerationPanel({
  product,
  me,
  pipeline,
  draft,
  onRefresh,
  onBusy,
  onQueued,
  onAddOriginal,
}: {
  product: ProductDto;
  onAddOriginal: () => void;
  me: Me;
  pipeline: PipelineDto;
  draft: StudioDraft;
  onRefresh: () => void;
  onBusy: (value: boolean) => void;
  onQueued: (job: JobDto) => void;
}) {
  const [results, setResults] = useState<ResultDto[]>([]),
    [selected, setSelected] = useState(""),
    [open, setOpen] = useState(false),
    [zoom, setZoom] = useState<string | null>(null);
  const [regenerate, setRegenerate] = useState<string | null>(null),
    [reason, setReason] = useState("lighting_focus"),
    [note, setNote] = useState(""),
    [quality, setQuality] = useState("medium"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const requestId = useRef(crypto.randomUUID());
  const [submission, setSubmission] = useState<StudioDraft>({});
  const [comparePrevious, setComparePrevious] = useState(false);
  const [usePerson, setUsePerson] = useState(false),
    [useLook, setUseLook] = useState(false);
  const personReference = product.assets.find(
      (a) => a.kind === "person_reference",
    ),
    lookReference = product.assets.find((a) => a.kind === "look_reference");
  const latestResult = useRef<string | null>(null),
    refreshSequence = useRef(0);
  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    const d = await request<ResultDto[]>(
      `/api/v1/products/${product.id}/results`,
    );
    if (sequence !== refreshSequence.current) return;
    setResults(d);
    if (d[0] && latestResult.current !== d[0].asset.id) {
      latestResult.current = d[0].asset.id;
      setSelected(d[0].asset.id);
      setComparePrevious(false);
    }
  }, [product.id]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: each durable pipeline snapshot can add a result in D1.
  useEffect(() => {
    void refresh().catch((e) => setError(errorMessage(e)));
  }, [refresh, pipeline]);
  const [sourceId, setSourceId] = useState("");
  const inputs = product.assets.filter((a) => a.kind === "input");
  const activeJob = pipeline.jobs.find((j) =>
    ["queued", "running"].includes(j.status),
  );
  const generationJob = pipeline.jobs.find((j) => j.kind === "generate");
  const result = results.find((r) => r.asset.id === selected) ?? results[0],
    source = inputs.find((a) => a.id === sourceId) ?? inputs[0],
    plan = pipeline.plans[0],
    active = pipeline.jobs.some((j) =>
      ["queued", "running"].includes(j.status),
    );
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
      onRefresh();
    } catch (e) {
      setError(errorMessage(e));
      onRefresh();
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  function begin(id: string | null) {
    setError("");
    setSubmission({
      analysis: draft.analysis ?? product.analysis ?? undefined,
      spec: draft.planId === plan?.id ? (draft.spec ?? plan?.spec) : plan?.spec,
    });
    setRegenerate(id);
    setReason("lighting_focus");
    setNote("");
    setUsePerson(Boolean(personReference));
    setUseLook(Boolean(lookReference));
    requestId.current = crypto.randomUUID();
    setOpen(true);
  }
  const submitting = useRef(false);
  async function submit(id: string | null, fromRevision = false) {
    if (busy || active || submitting.current || !plan) return;
    submitting.current = true;
    const current = fromRevision
      ? submission
      : {
          analysis: draft.analysis ?? product.analysis ?? undefined,
          spec:
            draft.planId === plan.id ? (draft.spec ?? plan.spec) : plan.spec,
        };
    const person = fromRevision ? usePerson : Boolean(personReference),
      look = fromRevision ? useLook : Boolean(lookReference);
    if (!fromRevision) requestId.current = crypto.randomUUID();
    try {
      await action(async () => {
        const queued = await request<JobDto>(
          `/api/v1/products/${product.id}/generate`,
          {
            method: "POST",
            body: JSON.stringify({
              consent: true,
              idempotencyKey: requestId.current,
              planId: plan.id,
              editedAnalysis: current.analysis,
              editedPlan: current.spec,
              quality,
              adjustments: fromRevision ? note : "",
              count: 1,
              regenerationOf: id,
              regenerationReason: id ? reason : null,
              personReferenceId: person ? (personReference?.id ?? null) : null,
              lookReferenceId: look ? (lookReference?.id ?? null) : null,
              referenceConsent: true,
            }),
          },
          me.csrf,
        );
        onQueued(queued);
        setOpen(false);
      });
    } finally {
      submitting.current = false;
    }
  }
  const imageUrl = (id: string) => `${apiBase}/api/v1/assets/${id}/content`;
  return (
    <section id="results" className="comparison-workspace relative">
      {error && (
        <p
          role="alert"
          className="mb-5 rounded-xl border border-danger-line bg-danger-surface p-4 text-sm text-danger"
        >
          {error}
        </p>
      )}
      <div className="comparison-toolbar">
        <div className="w-32">
          <Select
            label="출력 품질"
            value={quality}
            onChange={setQuality}
            options={[
              { value: "medium", label: "표준 품질" },
              { value: "high", label: "높은 품질" },
            ]}
          />
        </div>
        <h2 className="sr-only">원본과 결과</h2>
        <span className="mr-auto" />
        {result && (
          <>
            <a
              href={`${apiBase}/api/v1/assets/${result.asset.id}/download`}
              data-astro-reload
              aria-label="PNG 다운로드"
              title="PNG 다운로드"
              className="grid size-10 place-items-center rounded-lg border border-line text-muted hover:text-ink"
            >
              <ArrowDownToLine size={16} />
            </a>
            <Button
              variant="secondary"
              disabled={busy || active || !plan}
              onClick={() => begin(result.asset.id)}
            >
              <RotateCcw size={14} />이 컷 개선
            </Button>
          </>
        )}
        <Button
          disabled={busy || active || !plan}
          onClick={() => void submit(null)}
        >
          <ImagePlus size={17} aria-hidden="true" />
          이미지 생성
        </Button>
      </div>
      {me.mode === "mock" && (
        <p className="mt-2 text-right text-[11px] text-muted">
          Mock · 외부 비용 없음
        </p>
      )}
      {generationJob?.errorCode && !activeJob && (
        <div className="mt-5">
          <JobStatus
            job={generationJob}
            onDispatch={() =>
              void action(() =>
                request(
                  `/api/v1/jobs/${generationJob.id}/dispatch`,
                  { method: "POST" },
                  me.csrf,
                ),
              )
            }
          />
        </div>
      )}
      {result?.regenerationOf && (
        <fieldset className="my-3 flex flex-wrap gap-2" aria-label="비교 기준">
          <button
            type="button"
            aria-pressed={!comparePrevious}
            onClick={() => setComparePrevious(false)}
            className={`rounded-lg px-3 py-2 text-xs ${!comparePrevious ? "bg-elevated text-ink" : "text-muted"}`}
          >
            원본 의류와 비교
          </button>
          <button
            type="button"
            aria-pressed={comparePrevious}
            onClick={() => setComparePrevious(true)}
            className={`rounded-lg px-3 py-2 text-xs ${comparePrevious ? "bg-elevated text-ink" : "text-muted"}`}
          >
            이전 컷과 비교
          </button>
        </fieldset>
      )}
      <div className="comparison-stage">
        <div className="comparison-grid">
          <PhotoFrame
            side="original"
            onAdd={onAddOriginal}
            addDisabled={busy || active || inputs.length >= 3}
            addTitle={
              inputs.length >= 3
                ? "원본은 최대 3장까지 등록할 수 있어요"
                : busy || active
                  ? "작업 완료 후 원본 추가"
                  : "원본 사진 추가"
            }
            images={
              comparePrevious && result?.regenerationOf
                ? [{ id: result.regenerationOf }]
                : inputs
            }
            selectedId={
              (comparePrevious ? result?.regenerationOf : source?.id) ??
              undefined
            }
            onSelect={setSourceId}
            onZoom={setZoom}
            alt={`${product.name} ${comparePrevious ? "이전 컷" : "원본"} 비교`}
          />
          <PhotoFrame
            side="result"
            images={results.map((r) => r.asset)}
            selectedId={result?.asset.id}
            onSelect={(id) => {
              setSelected(id);
              setComparePrevious(false);
            }}
            onZoom={setZoom}
            alt={`${product.name} 결과 비교`}
            mock={result?.mock}
          >
            {activeJob && (
              <WorkPending
                job={activeJob}
                onDispatch={() =>
                  void action(() =>
                    request(
                      `/api/v1/jobs/${activeJob.id}/dispatch`,
                      { method: "POST" },
                      me.csrf,
                    ),
                  )
                }
              />
            )}
          </PhotoFrame>
        </div>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="이 컷 개선">
        {error && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="mt-5 space-y-4">
          <Select
            label="개선할 항목"
            value={reason}
            onChange={setReason}
            options={reasons}
          />
          <Field
            label="이번 컷에 반영할 요청 (선택)"
            value={note}
            onChange={setNote}
            multiline
          />
          {personReference && (
            <Select
              label="인물 참조"
              value={usePerson ? "use" : "omit"}
              onChange={(v) => setUsePerson(v === "use")}
              options={[
                { value: "use", label: "등록한 인물로 생성" },
                { value: "omit", label: "이전 컷의 인물 유지" },
              ]}
            />
          )}
          {lookReference && (
            <Select
              label="촬영 참조"
              value={useLook ? "use" : "omit"}
              onChange={(v) => setUseLook(v === "use")}
              options={[
                { value: "use", label: "등록한 구도로 생성" },
                { value: "omit", label: "참조 구도 제외" },
              ]}
            />
          )}
          {me.mode === "mock" && (
            <p className="text-xs text-muted">Mock · 외부 비용 없음</p>
          )}
          <Button
            className="w-full"
            disabled={busy || active}
            onClick={() => void submit(regenerate, true)}
          >
            수정해서 생성
          </Button>
        </div>
      </Modal>
      <ImageViewer
        key={zoom}
        src={zoom ? imageUrl(zoom) : null}
        onClose={() => setZoom(null)}
      />
    </section>
  );
}
