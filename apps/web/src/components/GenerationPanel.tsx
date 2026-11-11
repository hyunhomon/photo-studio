import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Check,
  ImagePlus,
  RotateCcw,
  ShieldCheck,
  X,
  ZoomIn,
} from "lucide-react";
import { Button, Modal, Select } from "@photo-studio/ui";
import type { PipelineDto, ProductDto, ResultDto } from "@photo-studio/schemas";
import { apiBase, errorMessage, type Me, request } from "../lib/api";
import { Field, JobStatus } from "./PlanningPanel";
export const reasons = [
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
    [reject, setReject] = useState(false),
    [zoom, setZoom] = useState<string | null>(null);
  const [regenerate, setRegenerate] = useState<string | null>(null),
    [reason, setReason] = useState("color_change"),
    [note, setNote] = useState(""),
    [quality, setQuality] = useState("medium"),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const requestId = useRef(crypto.randomUUID());
  const refresh = useCallback(async () => {
    const d = await request<ResultDto[]>(
      `/api/v1/products/${product.id}/results`,
    );
    setResults(d);
  }, [product.id]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: each durable pipeline snapshot can add a result or evaluation in D1.
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
    setReason("color_change");
    setConsent(false);
    requestId.current = crypto.randomUUID();
    setOpen(true);
  }
  async function feedback(decision: "accepted" | "rejected") {
    if (!result) return;
    await request(
      `/api/v1/assets/${result.asset.id}/feedback`,
      {
        method: "POST",
        body: JSON.stringify({
          decision,
          reason: decision === "rejected" ? reason : null,
          note: decision === "rejected" ? note : "",
        }),
      },
      me.csrf,
    );
    setReject(false);
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
          className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
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
                className={`shrink-0 overflow-hidden rounded-lg border-2 ${r.asset.id === result.asset.id ? "border-ink" : "border-transparent"}`}
                onClick={() => setSelected(r.asset.id)}
              >
                <img
                  src={imageUrl(r.asset.id)}
                  alt={`생성 결과 ${results.length - i}`}
                  className="h-20 w-16 bg-studio object-contain"
                />
              </button>
            ))}
          </fieldset>
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_260px]">
            <div className="grid gap-4 sm:grid-cols-2">
              {source && (
                <figure className="overflow-hidden rounded-panel border border-line bg-surface">
                  <figcaption className="flex items-center justify-between border-b border-line px-5 py-3 text-xs">
                    <span>원본 참조</span>
                    <span className="eyebrow text-muted">ORIGINAL</span>
                  </figcaption>
                  <button
                    type="button"
                    className="relative block w-full"
                    aria-label="원본 사진 확대"
                    onClick={() => setZoom(source.id)}
                  >
                    <img
                      src={imageUrl(source.id)}
                      alt={`${product.name} 원본 비교`}
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
              <p className="flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck size={17} aria-hidden="true" />
                품질 검수
                {result.mock && (
                  <span className="text-[10px] text-muted">MOCK</span>
                )}
              </p>
              <p className="mt-3 text-xs leading-6 text-muted">
                AI 평가는 참고 정보입니다. 로고·색상·패턴·핏을 확대해 직접
                확인해 주세요.
              </p>
              {result.quality ? (
                <>
                  <div className="mt-6 space-y-4">
                    {[
                      {
                        label: "상품 충실도",
                        value: result.quality.garmentFidelityScore,
                      },
                      {
                        label: "자연스러움",
                        value: result.quality.realismScore,
                      },
                      { label: "구도", value: result.quality.compositionScore },
                    ].map((s) => (
                      <div key={s.label}>
                        <div className="flex justify-between text-xs">
                          <span>{s.label}</span>
                          <span>{Math.round(s.value * 100)} / 100</span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                          <div
                            style={{ width: `${s.value * 100}%` }}
                            className="h-full rounded-full bg-[#75835e]"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <ul className="mt-6 space-y-3">
                    {result.quality.flaggedIssues.map((issue) => (
                      <li
                        key={`${issue.code}-${issue.reason}`}
                        className={`rounded-lg p-3 text-xs leading-6 ${issue.severity === "high" ? "bg-[#f3e6dd]" : "bg-studio"}`}
                      >
                        <span className="font-semibold">
                          {issue.severity === "high" ? "주의" : "확인"} ·{" "}
                        </span>
                        {issue.reason}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="mt-5 rounded-lg bg-studio p-4 text-xs leading-6">
                  아직 품질 평가가 없거나 평가에 실패했습니다. 이미지를 직접
                  검수할 수 있습니다. 평가는 자동으로 다시 호출하지 않습니다.
                </p>
              )}
              {result.feedback && (
                <p className="mt-5 rounded-lg border border-line p-3 text-xs">
                  {result.feedback.decision === "accepted"
                    ? "✓ 채택한 컷"
                    : "폐기한 컷"}
                  {result.feedback.reason &&
                    ` · ${reasons.find((r) => r.value === result.feedback?.reason)?.label ?? result.feedback.reason}`}
                </p>
              )}
              <div className="mt-6 grid grid-cols-2 gap-2">
                <Button
                  className="px-3"
                  disabled={busy}
                  onClick={() => void action(() => feedback("accepted"))}
                >
                  <Check size={14} aria-hidden="true" />
                  채택
                </Button>
                <Button
                  className="px-3"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setNote("");
                    setReason("color_change");
                    setReject(true);
                  }}
                >
                  <X size={14} aria-hidden="true" />
                  폐기
                </Button>
              </div>
              <a
                href={`${apiBase}/api/v1/assets/${result.asset.id}/download`}
                className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-full border border-line px-4 py-3 text-xs font-semibold"
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
                <RotateCcw size={14} aria-hidden="true" />
                사유를 남기고 재생성
              </Button>
              {result.regenerationReason && (
                <p className="mt-4 text-[11px] leading-6 text-muted">
                  이전 결과에서 재생성 ·{" "}
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
            ? "외부 AI 호출 없이 원본을 복사한 Mock 결과와 합성 평가를 만듭니다. 실제 화보 생성이 아닙니다."
            : "원본 참조와 승인한 콘셉트로 이미지 1장 및 품질 평가 1회를 요청합니다. 두 호출의 비용은 내 OpenRouter 크레딧에서 차감됩니다."
        }
      >
        <div className="mt-5 rounded-xl bg-studio p-4 text-xs leading-6">
          <p className="font-semibold">
            승인된 촬영:{" "}
            {plan?.spec.shootType === "model_location"
              ? "가상 로케이션컷"
              : "스튜디오컷"}{" "}
            · 3:4 · PNG
          </p>
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
            <p className="mb-2 text-xs text-muted">재생성 사유</p>
            <Select
              label="재생성 사유"
              value={reason}
              onChange={setReason}
              options={reasons}
            />
          </div>
        )}
        <p className="mt-4 text-xs leading-6 text-muted">
          이미지 모델: {me.models.image} / 평가 모델: {me.models.evaluation}.
          예상 호출: 이미지 1회 + 평가 1회. 정확한 비용은 사전 확정할 수
          없습니다. 응답이 불확실하면 자동 재생성을 멈춥니다.{" "}
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
            className="mt-1 size-4 accent-ink"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          이미지 생성·평가 비용과 승인된 콘셉트를 확인했습니다.
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
        open={reject}
        onClose={() => setReject(false)}
        title="이 컷을 폐기하는 이유"
        description="사유를 남기면 다음 결과의 품질 개선에 참고할 수 있습니다. 폐기는 사진을 삭제하지 않으며 비용을 환불하지 않습니다."
      >
        <div className="mt-5">
          <Select
            label="폐기 사유"
            value={reason}
            onChange={setReason}
            options={reasons}
          />
          <div className="mt-4">
            <Field
              label="추가 메모 (선택)"
              value={note}
              onChange={setNote}
              multiline
            />
          </div>
          <Button
            className="mt-5 w-full"
            disabled={busy}
            onClick={() => void action(() => feedback("rejected"))}
          >
            폐기 사유 저장
          </Button>
        </div>
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
