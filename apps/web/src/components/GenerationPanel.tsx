import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ImagePlus, RotateCcw, ZoomIn } from "lucide-react";
import { Button, Modal, Select } from "@photo-studio/ui";
import type {
  PipelineDto,
  ProductDto,
  ResultDto,
  StudioDraft,
} from "@photo-studio/schemas";
import { apiBase, errorMessage, type Me, request } from "../lib/api";
import WorkPending from "./WorkPending";
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
      <div className="comparison-selectors">
        {inputs.length > 1 && (
          <fieldset
            aria-label="원본 사진 선택"
            className="flex items-center gap-2"
          >
            <span className="mr-1 text-[10px] text-muted">원본</span>
            {inputs.map((a, i) => (
              <button
                type="button"
                key={a.id}
                aria-pressed={source?.id === a.id}
                aria-label={`원본 ${i + 1} 선택`}
                onClick={() => setSourceId(a.id)}
                className={`overflow-hidden rounded-lg border ${source?.id === a.id ? "border-primary" : "border-line"}`}
              >
                <img
                  src={imageUrl(a.id)}
                  alt=""
                  className="h-10 w-8 object-contain"
                />
              </button>
            ))}
          </fieldset>
        )}
        {result && (
          <fieldset
            aria-label="생성 결과 선택"
            className="flex min-w-0 items-center gap-2 overflow-x-auto"
          >
            <span className="mr-1 shrink-0 text-[10px] text-muted">결과</span>
            {results.map((r, i) => (
              <button
                type="button"
                key={r.asset.id}
                aria-pressed={r.asset.id === result.asset.id}
                aria-label={`결과 ${results.length - i} 선택`}
                className={`shrink-0 overflow-hidden rounded-lg border ${r.asset.id === result.asset.id ? "border-primary" : "border-line"}`}
                onClick={() => {
                  setSelected(r.asset.id);
                  setComparePrevious(false);
                }}
              >
                <img
                  src={imageUrl(r.asset.id)}
                  alt={`생성 결과 ${results.length - i}`}
                  className="h-10 w-8 bg-studio object-contain"
                />
              </button>
            ))}
          </fieldset>
        )}
      </div>
      {!result ? (
        <div className="comparison-stage">
          <div className="comparison-grid">
            <figure className="comparison-figure">
              <figcaption>원본 참조</figcaption>
              {source && (
                <button
                  type="button"
                  aria-label="비교 기준 사진 확대"
                  onClick={() => setZoom(source.id)}
                >
                  <img
                    src={imageUrl(source.id)}
                    alt={`${product.name} 원본 비교`}
                  />
                </button>
              )}
            </figure>
            <figure className="comparison-figure result-frame">
              <figcaption>새로운 컷</figcaption>
              <div className="flex min-h-64 flex-1 flex-col items-center justify-center p-8 text-center">
                <ImagePlus
                  size={30}
                  className="text-muted"
                  aria-hidden="true"
                />
                <h3 className="mt-5 text-base">다음 컷을 기다리고 있어요</h3>
                <p className="mt-3 text-xs leading-6 text-muted">
                  촬영 설정에서 기획을 확인한 뒤<br />
                  촬영을 시작해 주세요.
                </p>
              </div>
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
            </figure>
          </div>
        </div>
      ) : (
        <>
          {result.regenerationOf && (
            <fieldset
              className="mb-4 flex flex-wrap gap-2"
              aria-label="비교 기준"
            >
              <button
                type="button"
                className={`rounded-lg border px-4 py-2 text-xs ${!comparePrevious ? "border-primary text-primary" : "border-line text-muted"}`}
                aria-pressed={!comparePrevious}
                onClick={() => setComparePrevious(false)}
              >
                원본 의류와 비교
              </button>
              <button
                type="button"
                className={`rounded-lg border px-4 py-2 text-xs ${comparePrevious ? "border-primary text-primary" : "border-line text-muted"}`}
                aria-pressed={comparePrevious}
                onClick={() => setComparePrevious(true)}
              >
                이전 컷과 비교
              </button>
            </fieldset>
          )}
          <div className="comparison-stage">
            <div className="comparison-grid">
              {source && (
                <figure className="overflow-hidden rounded-panel border border-line bg-surface">
                  <figcaption className="flex items-center justify-between border-b border-line px-5 py-3 text-xs">
                    <span>
                      {comparePrevious && result.regenerationOf
                        ? "이전 컷 · 비교 기준"
                        : "원본 참조"}
                    </span>
                    <span className="eyebrow text-muted">
                      {comparePrevious ? "PREVIOUS" : "ORIGINAL"}
                    </span>
                  </figcaption>
                  <button
                    type="button"
                    className="relative block w-full"
                    aria-label="비교 기준 사진 확대"
                    onClick={() =>
                      setZoom(
                        comparePrevious && result.regenerationOf
                          ? result.regenerationOf
                          : source.id,
                      )
                    }
                  >
                    <img
                      src={imageUrl(
                        comparePrevious && result.regenerationOf
                          ? result.regenerationOf
                          : source.id,
                      )}
                      alt={`${product.name} ${comparePrevious && result.regenerationOf ? "이전 컷" : "원본"} 비교`}
                      className="aspect-[3/4] w-full bg-studio object-contain"
                    />
                    <ZoomIn
                      size={18}
                      className="absolute right-4 bottom-4"
                      aria-hidden="true"
                    />
                  </button>
                </figure>
              )}
              <figure className="result-frame overflow-hidden rounded-panel border border-line bg-surface">
                <figcaption className="flex items-center justify-between border-b border-line px-5 py-3 text-xs">
                  <span>
                    {result.mock ? "Mock 결과 · 원본 복사" : "AI 생성 결과"}
                  </span>
                  <span className="eyebrow text-muted">RESULT</span>
                </figcaption>
                <button
                  type="button"
                  className="relative block w-full"
                  aria-label="결과 사진 확대"
                  onClick={() => setZoom(result.asset.id)}
                >
                  <img
                    src={imageUrl(result.asset.id)}
                    alt={`${product.name} 결과 비교`}
                    className="aspect-[3/4] w-full bg-studio object-contain"
                  />
                  <ZoomIn
                    size={18}
                    className="absolute right-4 bottom-4"
                    aria-hidden="true"
                  />
                </button>
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
              </figure>
            </div>
          </div>
        </>
      )}
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
      <Modal
        open={Boolean(zoom)}
        onClose={() => setZoom(null)}
        title="디테일 확인"
        description="확대된 사진에서 상품 디테일을 확인해 주세요."
      >
        {zoom && (
          <img
            src={imageUrl(zoom)}
            alt="상품 디테일 확대"
            className="mt-5 max-h-[65vh] w-full object-contain"
          />
        )}
      </Modal>
    </section>
  );
}
