import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ImagePlus, RotateCcw } from "lucide-react";
import { Button, Modal, Select } from "@photo-studio/ui";
import type {
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
}: {
  product: ProductDto;
  me: Me;
  pipeline: PipelineDto;
  draft: StudioDraft;
  onRefresh: () => void;
}) {
  const [results, setResults] = useState<ResultDto[]>([]),
    [selected, setSelected] = useState(""),
    [open, setOpen] = useState(false),
    [zoom, setZoom] = useState<string | null>(null);
  const [regenerate, setRegenerate] = useState<string | null>(null),
    [reason, setReason] = useState("lighting_focus"),
    [note, setNote] = useState(""),
    [quality, setQuality] = useState("medium"),
    [consent, setConsent] = useState(false),
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
  const refresh = useCallback(async () => {
    const d = await request<ResultDto[]>(
      `/api/v1/products/${product.id}/results`,
    );
    setResults(d);
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
    setConsent(false);
    setUsePerson(Boolean(personReference));
    setUseLook(
      Boolean(lookReference && plan?.lookReferenceId === lookReference.id),
    );
    requestId.current = crypto.randomUUID();
    setOpen(true);
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
        <Button disabled={busy || active || !plan} onClick={() => begin(null)}>
          <ImagePlus size={17} aria-hidden="true" />
          이미지 생성
        </Button>
      </div>
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
      {!plan && (
        <p className="mt-4 text-xs text-muted">
          분석·기획 후 이미지를 생성할 수 있습니다.
        </p>
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
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={
          regenerate ? "한 장을 다시 생성할까요?" : "새로운 컷을 생성할까요?"
        }
        description={
          me.mode === "mock"
            ? "외부 AI 호출 없이 원본을 복사한 Mock 결과를 만듭니다. 실제 화보 생성이 아닙니다."
            : "원본 참조와 현재 촬영 설정으로 이미지 1장을 요청합니다. 이미지 생성 1회 비용이 내 OpenRouter 크레딧에서 차감됩니다. 자동 평가 호출은 없습니다."
        }
      >
        {error && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="mt-5 rounded-xl bg-studio p-4 text-xs leading-6">
          <p className="font-semibold">현재 촬영 설정 · 3:4 · PNG</p>
          <p>
            {submission.spec?.mood} / {submission.spec?.model.style}
          </p>
          <p>
            {submission.spec?.location.type} · {submission.spec?.lighting}
          </p>
        </div>
        <div className="mt-4">
          <p className="mb-2 text-xs text-muted">출력 품질</p>
          <Select
            label="출력 품질"
            value={quality}
            onChange={setQuality}
            options={[
              { value: "medium", label: "Medium · 표준 품질" },
              { value: "high", label: "High · 높은 품질, 더 높은 비용 가능" },
            ]}
          />
        </div>
        {regenerate && (
          <div className="mt-4">
            <p className="mb-2 text-xs text-muted">이번에 개선할 한 가지</p>
            <Select
              label="개선할 항목"
              value={reason}
              onChange={setReason}
              options={reasons}
            />
          </div>
        )}
        <div className="mt-4">
          <Field
            label="이번 컷에 반영할 요청 (선택)"
            value={note}
            onChange={setNote}
            multiline
          />
        </div>
        {(personReference || lookReference) && (
          <fieldset className="mt-5 space-y-3 rounded-xl border border-line bg-studio p-4">
            <legend className="px-1 text-xs font-semibold">
              이번 생성에 사용할 촬영 참조
            </legend>
            {personReference && (
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-primary"
                  checked={usePerson}
                  onChange={(e) => setUsePerson(e.target.checked)}
                />
                <img
                  src={imageUrl(personReference.id)}
                  alt=""
                  aria-hidden="true"
                  className="h-14 w-12 rounded-md bg-surface object-contain"
                />
                인물 참조 사진 사용
              </label>
            )}
            {lookReference && (
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-primary"
                  checked={useLook}
                  onChange={(e) => setUseLook(e.target.checked)}
                />
                <img
                  src={imageUrl(lookReference.id)}
                  alt=""
                  aria-hidden="true"
                  className="h-14 w-12 rounded-md bg-surface object-contain"
                />
                촬영감 참조 사진 사용
              </label>
            )}
            <p className="text-xs leading-6 text-muted">
              선택한 사진이 OpenRouter와 모델 제공사에 전달됩니다. 인물은
              생김새, 촬영감은 톤·명암·선예도의 기준이며 의류 원본이 항상
              우선입니다. 결과의 얼굴·질감 보존은 보장되지 않습니다.
            </p>
          </fieldset>
        )}
        {regenerate && (
          <p className="mt-3 text-xs leading-6 text-muted">
            {usePerson && personReference
              ? "선택한 인물 사진을 얼굴 기준으로 우선합니다."
              : "이전 컷의 인물 특징을 참조합니다."}{" "}
            빛·초점·피부 표현은 다시 구성합니다. 의류가 충분히 보이도록 구도가
            달라질 수 있으며, 원본 의류가 보존 기준입니다.
          </p>
        )}
        <p className="mt-4 text-xs leading-6 text-muted">
          현재 상품 이해와 촬영 콘셉트를 함께 저장하고 이 설정으로 생성합니다.
        </p>
        <p className="mt-4 text-xs leading-6 text-muted">
          이미지 모델: {me.models.image}. 예상 호출: 이미지 1회. 정확한 비용은
          사전 확정할 수 없으며 참조 사진의 수·크기에 따라 달라질 수 있습니다.
          응답이 불확실하면 자동 재생성을 멈춥니다.{" "}
          <a
            href="https://openrouter.ai/models/openai/gpt-image-2"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            모델 요금
          </a>
        </p>
        <label className="mt-5 flex items-start gap-3 text-sm leading-6">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-primary"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          현재 편집 내용의 저장과 이미지 생성 비용을 확인했습니다.
        </label>
        <Button
          className="mt-5 w-full"
          disabled={!consent || busy || active}
          onClick={() =>
            void action(async () => {
              await request(
                `/api/v1/products/${product.id}/generate`,
                {
                  method: "POST",
                  body: JSON.stringify({
                    consent: true,
                    idempotencyKey: requestId.current,
                    planId: plan?.id,
                    editedAnalysis: submission.analysis,
                    editedPlan: submission.spec,
                    quality,
                    adjustments: note,
                    count: 1,
                    regenerationOf: regenerate,
                    regenerationReason: regenerate ? reason : null,
                    personReferenceId: usePerson
                      ? (personReference?.id ?? null)
                      : null,
                    lookReferenceId: useLook
                      ? (lookReference?.id ?? null)
                      : null,
                    referenceConsent: Boolean(
                      (usePerson && personReference) ||
                      (useLook && lookReference),
                    ),
                  }),
                },
                me.csrf,
              );
              setOpen(false);
            })
          }
        >
          동의하고 1장 생성
        </Button>
      </Modal>
      <ImageViewer
        key={zoom}
        src={zoom ? imageUrl(zoom) : null}
        onClose={() => setZoom(null)}
      />
    </section>
  );
}
