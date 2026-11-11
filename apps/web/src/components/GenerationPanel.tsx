import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ImagePlus, RotateCcw, ZoomIn } from "lucide-react";
import { Button, Modal, Select } from "@photo-studio/ui";
import type { PipelineDto, ProductDto, ResultDto } from "@photo-studio/schemas";
import { apiBase, errorMessage, type Me, request } from "../lib/api";
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
  onRefresh,
}: {
  product: ProductDto;
  me: Me;
  pipeline: PipelineDto;
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
  const [comparePrevious, setComparePrevious] = useState(false);
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
  const generationJob = pipeline.jobs.find((j) => j.kind === "generate");
  const result = results.find((r) => r.asset.id === selected) ?? results[0],
    source = product.assets.find((a) => a.kind === "input"),
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
    setRegenerate(id);
    setReason("lighting_focus");
    setNote("");
    setConsent(false);
    requestId.current = crypto.randomUUID();
    setOpen(true);
  }
  const imageUrl = (id: string) => `${apiBase}/api/v1/assets/${id}/content`;
  return (
    <section
      id="results"
      className="mt-9 scroll-mt-6 border-t border-line pt-9"
    >
      {error && (
        <p
          role="alert"
          className="mb-5 rounded-xl border border-danger-line bg-danger-surface p-4 text-sm text-danger"
        >
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="eyebrow text-muted">02 / CREATE & REVIEW</p>
          <h2 className="mt-3 text-2xl">
            당신의 다음 컷.<span className="sr-only">이미지 생성과 검수</span>
          </h2>
          <p className="mt-3 text-sm text-muted">
            승인한 콘셉트로 한 장씩. 최종 선택은 직접 합니다.
          </p>
        </div>
        <Button
          disabled={busy || active || plan?.status !== "approved"}
          onClick={() => begin(null)}
        >
          <ImagePlus size={17} aria-hidden="true" />
          승인된 콘셉트로 생성
        </Button>
      </div>
      {generationJob && (
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
      {plan?.status !== "approved" && (
        <p className="mt-4 text-xs text-muted">
          분석·기획 후 촬영 콘셉트를 승인하면 생성할 수 있습니다.
        </p>
      )}
      {!result ? (
        <div className="mt-7 grid min-h-72 place-items-center rounded-panel border border-dashed border-line bg-surface text-center">
          <div className="p-8">
            <div className="mx-auto grid size-14 place-items-center rounded-full bg-studio">
              <ImagePlus size={23} aria-hidden="true" />
            </div>
            <p className="mt-5 font-editorial text-lg">
              첫 컷을 기다리는 스튜디오
            </p>
            <p className="mt-3 text-xs leading-6 text-muted">
              생성 결과는 이곳에서 원본과 비교하고 내려받을 수 있습니다.
            </p>
          </div>
        </div>
      ) : (
        <>
          <fieldset
            className="mt-7 flex items-center gap-3 overflow-x-auto pb-3"
            aria-label="생성 결과 선택"
          >
            {results.map((r, i) => (
              <button
                type="button"
                key={r.asset.id}
                aria-pressed={r.asset.id === result.asset.id}
                aria-label={`결과 ${results.length - i} 선택`}
                className={`shrink-0 overflow-hidden rounded-lg border-2 ${r.asset.id === result.asset.id ? "border-primary" : "border-transparent"}`}
                onClick={() => {
                  setSelected(r.asset.id);
                  setComparePrevious(false);
                }}
              >
                <img
                  src={imageUrl(r.asset.id)}
                  alt={`생성 결과 ${results.length - i}`}
                  className="h-20 w-16 bg-studio object-contain"
                />
              </button>
            ))}
          </fieldset>
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
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_260px]">
            <div className="grid gap-4 sm:grid-cols-2">
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
              <figure className="overflow-hidden rounded-panel border border-line bg-surface">
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
              </figure>
            </div>
            <aside className="rounded-panel border border-line bg-surface p-6">
              <h3 className="text-base font-semibold">
                {comparePrevious ? "이전 컷과 직접 확인" : "원본과 직접 확인"}
              </h3>
              <p className="mt-3 text-xs leading-6 text-muted">
                세 가지를 확대해 비교해 보세요.
              </p>
              <ul className="mt-5 space-y-5 text-xs leading-6">
                <li>
                  <strong className="block text-ink">빛과 초점</strong>
                  <span className="text-muted">
                    얼굴·옷·배경의 빛 방향, 바닥의 접촉 그림자, 거리와 이어지는
                    초점 흐림을 확인하세요.
                  </span>
                </li>
                <li>
                  <strong className="block text-ink">인물의 자연스러움</strong>
                  <span className="text-muted">
                    눈과 피부의 질감, 표정·손·몸의 무게 중심이 함께 자연스러운지
                    확인하세요.
                  </span>
                </li>
                <li>
                  <strong className="block text-ink">소재 표현</strong>
                  <span className="text-muted">
                    원본의 로고·조직·주름과 두께감이 유지되고, 주변 표면이 모두
                    같은 재질처럼 보이지 않는지 확인하세요.
                  </span>
                </li>
              </ul>
              <p className="mt-5 text-[10px] text-muted">
                {result.captureVersion
                  ? "빛·인물·소재를 반영한 촬영 지시 적용"
                  : "이전 촬영 지시로 만든 컷"}
              </p>
              <a
                href={`${apiBase}/api/v1/assets/${result.asset.id}/download`}
                data-astro-reload
                className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-lg border border-control px-4 py-3 text-xs font-semibold hover:bg-elevated"
              >
                <ArrowDownToLine size={14} aria-hidden="true" />
                PNG 다운로드
              </a>
              <Button
                className="mt-3 w-full px-3"
                variant="secondary"
                disabled={busy || active || plan?.status !== "approved"}
                onClick={() => begin(result.asset.id)}
              >
                <RotateCcw size={14} aria-hidden="true" />이 컷 개선
              </Button>
              {result.regenerationReason && (
                <p className="mt-4 text-[11px] leading-6 text-muted">
                  이전 컷에서 개선 ·{" "}
                  {reasons.find((r) => r.value === result.regenerationReason)
                    ?.label ?? result.regenerationReason}
                </p>
              )}
            </aside>
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
            : "원본 참조와 승인한 촬영 지시로 이미지 1장을 요청합니다. 이미지 생성 1회 비용이 내 OpenRouter 크레딧에서 차감됩니다. 자동 평가 호출은 없습니다."
        }
      >
        <div className="mt-5 rounded-xl bg-studio p-4 text-xs leading-6">
          <p className="font-semibold">승인된 촬영 지시 · 3:4 · PNG</p>
          <p>
            {plan?.spec.mood} / {plan?.spec.model.style}
          </p>
          <p>
            {plan?.spec.location.type} · {plan?.spec.lighting}
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
        {regenerate && (
          <p className="mt-3 text-xs leading-6 text-muted">
            이전 컷을 인물·구도 연속성 참조로 함께 사용합니다. 선택한 항목을
            우선 고치며 원본 의류가 보존 기준입니다.
          </p>
        )}
        <p className="mt-4 text-xs leading-6 text-muted">
          이미지 모델: {me.models.image}. 예상 호출: 이미지 1회. 정확한 비용은
          사전 확정할 수 없습니다. 응답이 불확실하면 자동 재생성을 멈춥니다.{" "}
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
          이미지 생성 비용과 승인된 촬영 지시를 확인했습니다.
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
                    quality,
                    adjustments: note,
                    count: 1,
                    regenerationOf: regenerate,
                    regenerationReason: regenerate ? reason : null,
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
