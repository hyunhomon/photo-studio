import { useCallback, useEffect, useState, useId, useRef } from "react";
import {
  Check,
  CheckCircle2,
  Clock3,
  ScanSearch,
  SlidersHorizontal,
} from "lucide-react";
import { TabGroup, TabList, Tab, TabPanels, TabPanel } from "@headlessui/react";
import type { ReactNode } from "react";
import { Button, Modal, Select } from "@photo-studio/ui";
import type {
  JobDto,
  PipelineDto,
  PlanDto,
  PresetDto,
  ProductAnalysis,
  ProductDto,
  ShootPlan,
} from "@photo-studio/schemas";
import { apiBase, errorMessage, type Me, request } from "../lib/api";

export const jobLabels: Record<string, string> = {
  queued: "작업 대기",
  running: "작업 중",
  completed: "완료",
  needs_review: "직접 검수 필요",
  failed: "작업 실패",
  outcome_unknown: "응답 미확인 · 자동 재요청 중지",
  cancelled: "취소됨",
  evaluation_failed: "평가 실패 · 직접 검수 가능",
};
const stageLabels: Record<string, string> = {
  queued: "시작 대기",
  analysis: "상품 분석",
  planning: "촬영 기획",
  review_plan: "콘셉트 확인",
  generation: "이미지 생성",
  evaluation: "품질 평가",
  review: "결과 검수",
};
const failureLabels: Record<string, string> = {
  INSUFFICIENT_PROVIDER_CREDIT:
    "OpenRouter 크레딧 또는 키 한도를 확인해 주세요.",
  PROVIDER_KEY_INVALID: "OpenRouter를 다시 연결해 주세요.",
  PROVIDER_NOT_CONNECTED: "계정 설정에서 OpenRouter를 연결해 주세요.",
  MODEL_NOT_CONFIGURED: "분석 모델 설정이 필요합니다.",
  MODEL_CAPABILITY_UNSUPPORTED:
    "모델이 필요한 이미지 입력·구조화 출력 기능을 지원하지 않습니다.",
  CAPABILITY_UNAVAILABLE: "모델 기능을 확인할 수 없어 호출하지 않았습니다.",
  INVALID_PROVIDER_OUTPUT:
    "AI 응답을 받았지만 앱에서 사용할 수 있는 형식이 아닙니다. 제공된 비용 기록은 보존하며 자동 재호출하지 않습니다.",
  PROVIDER_OUTPUT_TRUNCATED:
    "AI 응답이 끝나기 전에 잘렸습니다. 기록된 비용을 확인해 주세요. 자동 재호출하지 않습니다.",
  PROVIDER_OUTPUT_BLOCKED:
    "AI 제공자가 응답을 제한했습니다. 상품 설명과 사진을 확인해 주세요. 자동 재호출하지 않습니다.",
  SOURCE_TOO_LARGE:
    "의류·인물·촬영감·이전 컷의 참조 용량이 합계 12MB를 초과했습니다. 선택한 참조를 줄이거나 더 작은 파일로 등록해 주세요. AI는 호출하지 않았습니다.",
  REFERENCE_CONSENT_REQUIRED:
    "선택한 인물·촬영감 사진의 외부 처리 동의를 확인해 주세요. AI는 호출하지 않았습니다.",
  DISPATCH_PENDING:
    "실행 요청 전달을 확인하지 못했습니다. 안전하게 연결을 다시 확인할 수 있습니다.",
  PROVIDER_RATE_LIMITED: "OpenRouter 요청 한도에 도달했습니다.",
  PROVIDER_OUTCOME_UNKNOWN:
    "OpenRouter에서 과금됐을 수 있습니다. 계정의 사용 기록을 먼저 확인해 주세요. 이 요청은 자동 재전송하지 않습니다.",
};
export function JobStatus({
  job,
  onDispatch,
}: {
  job: JobDto;
  onDispatch?: () => void;
}) {
  return (
    <div className="rounded-xl border border-line bg-paper p-5" role="status">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Clock3 size={16} aria-hidden="true" />
        {jobLabels[job.status] ?? job.status}
        <span className="ml-auto text-xs font-normal text-muted">
          {stageLabels[job.stage] ?? job.stage}
        </span>
      </div>
      {job.errorCode && (
        <p className="mt-3 text-xs leading-6 text-muted">
          {failureLabels[job.errorCode] ??
            "작업을 완료하지 못했습니다. 사용 기록을 확인한 뒤 새 작업을 시작할 수 있습니다."}
        </p>
      )}
      {job.status === "failed" && job.stage === "planning" && (
        <p className="mt-2 text-xs leading-6 text-muted">
          완료된 상품 분석은 보존했습니다. ‘이 분석으로 기획 다시 만들기’에서
          기획 1회 비용을 확인한 뒤 다시 요청할 수 있습니다.
        </p>
      )}
      {job.status === "queued" && job.errorCode === "DISPATCH_PENDING" && (
        <Button className="mt-3" variant="secondary" onClick={onDispatch}>
          작업 연결 재확인
        </Button>
      )}
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-muted">
        {job.attempts.map((a) => (
          <span key={a.stage}>
            {stageLabels[a.stage] ?? a.stage} ·{" "}
            {a.actualCostUsd === null
              ? "비용 미확인"
              : `$${a.actualCostUsd.toFixed(5)}`}{" "}
            ·{" "}
            {a.durationMs === null
              ? "진행 중"
              : `${(a.durationMs / 1000).toFixed(1)}초`}
          </span>
        ))}
      </div>
    </div>
  );
}
export function Field({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="block text-xs font-medium text-muted">
      {label}
      {multiline ? (
        <textarea
          id={id}
          className="studio-input mt-2 min-h-24 resize-y"
          value={value}
          maxLength={1000}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          id={id}
          className="studio-input mt-2"
          value={value}
          maxLength={500}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}
export function AnalysisEditor({
  analysis,
  onSave,
  busy,
}: {
  analysis: ProductAnalysis;
  onSave: (a: ProductAnalysis) => void;
  busy: boolean;
}) {
  const [value, setValue] = useState(analysis);
  return (
    <section className="rounded-panel border border-line bg-surface p-6">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg">상품 이해</h2>
        <span className="text-[10px] tracking-wider text-muted">
          EDITABLE / AI + YOU
        </span>
      </div>
      <div className="grid gap-4">
        <Field
          label="의류 종류"
          value={value.garmentType}
          onChange={(v) => setValue({ ...value, garmentType: v })}
        />
        <Field
          label="색상 (쉼표 구분)"
          value={value.colors.join(", ")}
          onChange={(v) =>
            setValue({ ...value, colors: v.split(",").map((s) => s.trim()) })
          }
        />
        <Field
          label="패턴"
          value={value.pattern}
          onChange={(v) => setValue({ ...value, pattern: v })}
        />
        <Field
          label="실루엣"
          value={value.silhouette}
          onChange={(v) => setValue({ ...value, silhouette: v })}
        />
        <Field
          label="소재 추정 · 확인 필요"
          value={value.materialGuess.value}
          onChange={(v) =>
            setValue({
              ...value,
              materialGuess: { ...value.materialGuess, value: v },
            })
          }
        />
        <Field
          label="시즌 (쉼표 구분)"
          value={value.seasonGuess.join(", ")}
          onChange={(v) =>
            setValue({
              ...value,
              seasonGuess: v.split(",").map((s) => s.trim()),
            })
          }
        />
      </div>
      <div className="mt-4 grid gap-4">
        <Field
          label="반드시 보존할 디테일 (한 줄에 하나)"
          value={value.preservationPoints.join("\n")}
          multiline
          onChange={(v) =>
            setValue({ ...value, preservationPoints: v.split("\n") })
          }
        />
        <Field
          label="불확실한 부분 (한 줄에 하나)"
          value={value.uncertainties.join("\n")}
          multiline
          onChange={(v) => setValue({ ...value, uncertainties: v.split("\n") })}
        />
      </div>
      <p className="mt-4 text-xs leading-6 text-muted">
        소재 추정 신뢰도 {Math.round(value.materialGuess.confidence * 100)}%.
        사진 분석은 실제 소재·치수를 보증하지 않습니다. 수정 시 촬영 콘셉트를
        다시 승인해야 합니다.
      </p>
      <Button
        className="mt-5"
        variant="secondary"
        disabled={busy}
        onClick={() => onSave(value)}
      >
        분석 수정 저장
      </Button>
    </section>
  );
}
export function PlanEditor({
  plan,
  onSave,
  busy,
}: {
  plan: PlanDto;
  onSave: (spec: ShootPlan, approved: boolean) => void;
  busy: boolean;
}) {
  const [v, set] = useState(plan.spec);
  return (
    <section className="rounded-panel border border-line bg-surface p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl">촬영 콘셉트</h2>
        <span className="rounded-full border border-line px-3 py-1.5 text-[10px]">
          V{plan.version} ·{" "}
          {plan.status === "approved" ? "승인됨" : "확인 필요"}
        </span>
      </div>
      {plan.spec.referenceNotes && (
        <div className="my-4 rounded-xl bg-accent-soft p-3 text-xs leading-6 text-muted">
          <strong className="block text-primary">레퍼런스 관찰</strong>
          {plan.spec.referenceNotes}
        </div>
      )}
      <p className="my-4 text-xs leading-6 text-muted">
        원본의 보존 포인트를 확인하고 무드·모델·장소를 조정해 주세요. 상품
        사진은 얼굴보다 의류 전체와 밑단·소매가 보이는 구도를 권장합니다.
      </p>
      <div className="grid gap-4">
        <Field
          label="시즌"
          value={v.season}
          onChange={(s) => set({ ...v, season: s })}
        />
        <Field
          label="무드"
          value={v.mood}
          onChange={(s) => set({ ...v, mood: s })}
        />
        <Field
          label="모델 스타일 (성인)"
          value={v.model.style}
          onChange={(s) => set({ ...v, model: { ...v.model, style: s } })}
        />
        <Field
          label="포즈"
          value={v.model.pose}
          onChange={(s) => set({ ...v, model: { ...v.model, pose: s } })}
        />
        <Field
          label="프레이밍"
          value={v.camera.framing}
          onChange={(s) => set({ ...v, camera: { ...v.camera, framing: s } })}
        />
        <Field
          label="카메라 각도"
          value={v.camera.angle}
          onChange={(s) => set({ ...v, camera: { ...v.camera, angle: s } })}
        />
        <Field
          label="장소"
          value={v.location.type}
          onChange={(s) => set({ ...v, location: { ...v.location, type: s } })}
        />
        <Field
          label="시간대"
          value={v.location.time}
          onChange={(s) => set({ ...v, location: { ...v.location, time: s } })}
        />
        <Field
          label="조명"
          value={v.lighting}
          onChange={(s) => set({ ...v, lighting: s })}
        />
      </div>
      <div className="mt-5 grid gap-4">
        <div>
          <p className="mb-2 text-xs text-muted">배경 분리</p>
          <Select
            label="배경 분리"
            value={v.camera.backgroundSeparation}
            onChange={(value) =>
              set({
                ...v,
                camera: {
                  ...v.camera,
                  backgroundSeparation:
                    value as ShootPlan["camera"]["backgroundSeparation"],
                },
              })
            }
            options={[
              { value: "gentle", label: "은은하게 · 주변도 자연스럽게" },
              { value: "balanced", label: "자연스럽게 · 상품 중심" },
              { value: "separated", label: "분리감 있게 · 멀리 있는 배경" },
            ]}
          />
        </div>
        <Field
          label="인물 인상 (성인 · 선택)"
          value={v.model.appearance}
          onChange={(appearance) =>
            set({ ...v, model: { ...v.model, appearance } })
          }
          multiline
        />
        <p className="text-[11px] leading-6 text-muted">
          나이대, 머리 모양, 표정과 개성을 적어 주세요. 묘사는 가상 성인 인물의
          방향을 정하며, 특정 인물의 동일성을 보장하지 않습니다.
        </p>
        <Field
          label="소재 표현 지시 (선택)"
          value={v.materialDirection}
          onChange={(materialDirection) => set({ ...v, materialDirection })}
          multiline
        />
      </div>
      <div className="mt-4">
        <Field
          label="촬영 시 보존할 요소 (한 줄에 하나)"
          value={v.mustPreserve.join("\n")}
          multiline
          onChange={(s) => set({ ...v, mustPreserve: s.split("\n") })}
        />
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => onSave(v, false)}
        >
          수정 저장
        </Button>
        <Button disabled={busy} onClick={() => onSave(v, true)}>
          <Check size={15} aria-hidden="true" />
          콘셉트 승인
        </Button>
      </div>
      <p className="mt-3 text-[11px] text-muted">
        승인만으로 이미지를 생성하거나 비용을 청구하지 않습니다.
      </p>
    </section>
  );
}
export default function PlanningPanel({
  product,
  me,
  onRefresh,
  onPipeline,
  referencesPanel,
}: {
  product: ProductDto;
  me: Me;
  onRefresh: () => void;
  onPipeline?: (data: PipelineDto) => void;
  referencesPanel?: ReactNode;
}) {
  const requestId = useRef(crypto.randomUUID());
  const [tab, setTab] = useState(0),
    [useLook, setUseLook] = useState(true);
  const lookReference = product.assets.find((a) => a.kind === "look_reference");
  const [data, setData] = useState<PipelineDto>({ plans: [], jobs: [] }),
    [presets, setPresets] = useState<PresetDto[]>([]),
    [preset, setPreset] = useState(""),
    [description, setDescription] = useState("");
  const [consent, setConsent] = useState(false),
    [reuseAnalysis, setReuseAnalysis] = useState(false),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const refresh = useCallback(async () => {
    const d = await request<PipelineDto>(
      `/api/v1/products/${product.id}/pipeline`,
    );
    setData(d);
    onPipeline?.(d);
  }, [product.id, onPipeline]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: parent refresh signals a mutation made in the separate generation panel.
  useEffect(() => {
    void refresh().catch((e) => setError(errorMessage(e)));
  }, [refresh, product]);
  useEffect(() => {
    request<PresetDto[]>("/api/v1/presets")
      .then(setPresets)
      .catch((e) => setError(errorMessage(e)));
  }, []);
  const active = data.jobs.some((j) =>
    ["queued", "running"].includes(j.status),
  );
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      void refresh()
        .then(onRefresh)
        .catch((e) => setError(errorMessage(e)));
    }, 2000);
    return () => clearInterval(timer);
  }, [active, refresh, onRefresh]);
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
      onRefresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const plan = data.plans[0];
  useEffect(() => {
    if (plan?.id) setTab(2);
  }, [plan?.id]);
  return (
    <div className="planning-panel">
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-danger-line bg-danger-surface p-4 text-sm text-danger"
        >
          {error}
        </p>
      )}
      <TabGroup selectedIndex={tab} onChange={setTab}>
        <TabList className="sticky top-0 z-10 grid grid-cols-3 gap-1 border-b border-line bg-surface p-3">
          {["기획", "상품 이해", "촬영 콘셉트"].map((label, index) => (
            <Tab
              key={label}
              disabled={
                index === 1 ? !product.analysis : index === 2 ? !plan : false
              }
              className="rounded-lg px-2 py-3 text-xs font-semibold text-muted data-selected:bg-elevated data-selected:text-ink disabled:opacity-35"
            >
              {label}
            </Tab>
          ))}
        </TabList>
        <TabPanels>
          <TabPanel unmount={false} className="space-y-5 p-5">
            <section className="space-y-4">
              <p className="eyebrow text-muted">01 / UNDERSTAND & DIRECT</p>
              <div className="mt-4 flex items-center gap-3">
                <ScanSearch size={22} aria-hidden="true" />
                <h2 className="text-xl">한 벌을 위한 촬영 기획</h2>
              </div>
              <p className="mt-3 text-sm leading-7 text-muted">
                사진 속 디테일을 분석하고, 브랜드에 어울리는 촬영 콘셉트를
                제안합니다. 업로드만으로 AI가 실행되지는 않습니다.
              </p>
              <div className="mt-5 grid gap-4">
                {lookReference && (
                  <label className="flex items-start gap-3 rounded-xl bg-paper p-3 text-xs leading-6">
                    <input
                      type="checkbox"
                      checked={useLook}
                      onChange={(e) => setUseLook(e.target.checked)}
                      className="mt-1 size-4 shrink-0 accent-primary"
                    />
                    촬영 레퍼런스의 구도·빛·분위기로 기획하기
                  </label>
                )}
                <Select
                  label="사용할 브랜드 프리셋"
                  value={preset}
                  onChange={setPreset}
                  options={[
                    { value: "", label: "상품에 맞게 추천" },
                    ...presets.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                />
                <Field
                  label="상품 설명 · 기획 요청 (선택)"
                  value={description}
                  onChange={setDescription}
                  multiline
                />
              </div>
              <Button
                className="mt-5"
                disabled={busy || active}
                onClick={() => {
                  setReuseAnalysis(false);
                  setConsent(false);
                  requestId.current = crypto.randomUUID();
                  setOpen(true);
                }}
              >
                <SlidersHorizontal size={15} aria-hidden="true" />
                {product.analysis ? "새로 분석·기획" : "분석 시작"}
              </Button>
              {product.analysis && (
                <div className="mt-4 border-t border-line pt-4">
                  <p className="text-xs leading-6 text-muted">
                    완료된 상품 분석을 그대로 사용해 촬영 기획만 새로 요청할 수
                    있습니다. 다음 화면에서 기획 1회 비용 안내를 확인한 뒤
                    실행합니다.
                  </p>
                  <Button
                    className="mt-3"
                    variant="secondary"
                    disabled={busy || active}
                    onClick={() => {
                      setReuseAnalysis(true);
                      setConsent(false);
                      requestId.current = crypto.randomUUID();
                      setOpen(true);
                    }}
                  >
                    이 분석으로 기획 다시 만들기
                  </Button>
                </div>
              )}
            </section>
            {referencesPanel}
          </TabPanel>
          <TabPanel unmount={false} className="p-5">
            {product.analysis && (
              <AnalysisEditor
                key={JSON.stringify(product.analysis)}
                analysis={product.analysis}
                busy={busy || active}
                onSave={(a) =>
                  void action(() =>
                    request(
                      `/api/v1/products/${product.id}/analysis`,
                      { method: "PATCH", body: JSON.stringify(a) },
                      me.csrf,
                    ),
                  )
                }
              />
            )}
          </TabPanel>
          <TabPanel unmount={false} className="p-5">
            {plan && (
              <PlanEditor
                key={`${plan.id}-${plan.status}`}
                plan={plan}
                busy={busy || active}
                onSave={(spec, approved) =>
                  void action(() =>
                    request(
                      `/api/v1/plans/${plan.id}`,
                      {
                        method: "PATCH",
                        body: JSON.stringify({ spec, approved }),
                      },
                      me.csrf,
                    ),
                  )
                }
              />
            )}
          </TabPanel>
        </TabPanels>
      </TabGroup>
      {!active && data.jobs[0]?.errorCode && (
        <div className="px-5 pb-5">
          <JobStatus job={data.jobs[0]} />
        </div>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={
          reuseAnalysis
            ? "기존 분석으로 촬영 기획만 만들까요?"
            : "상품 분석·기획을 시작할까요?"
        }
        description={
          reuseAnalysis
            ? me.mode === "mock"
              ? "저장된 분석으로 Mock 기획 1회를 실행합니다. 외부 AI 비용은 없습니다."
              : "저장된 상품 분석과 설명으로 촬영 기획 1회를 요청합니다. 사진 분석은 다시 호출하지 않습니다. 새 기획 비용이 내 OpenRouter 크레딧에서 차감됩니다."
            : me.mode === "mock"
              ? "Mock 분석과 기획을 각각 한 번 실행합니다. 외부 전송이나 비용 없이 합성 결과를 만듭니다."
              : "상품 사진과 설명을 OpenRouter에 전송합니다. 상품 분석 1회와 촬영 기획 1회의 AI 호출 비용이 내 OpenRouter 크레딧에서 차감됩니다."
        }
      >
        {useLook && lookReference && (
          <div className="mt-4 flex items-start gap-3 rounded-lg bg-studio p-3 text-xs leading-6">
            <img
              src={`${apiBase}/api/v1/assets/${lookReference.id}/content`}
              alt="기획에 사용할 촬영 레퍼런스"
              className="h-20 w-16 shrink-0 rounded-md object-contain"
            />
            <p>
              선택한 촬영 레퍼런스를 기획 호출에 함께 전송합니다. 추가 AI 단계
              없이 빛·무드·구도를 읽고, 의류 원본과 구분해 반영합니다.
            </p>
          </div>
        )}
        <p className="mt-4 text-xs text-muted">
          분석·기획 모델: {me.models.analysis}
        </p>
        <p className="mt-5 text-xs leading-7 text-muted">
          정확한 비용은 입력·출력과 모델에 따라 달라 사전에 확정할 수 없습니다.
          제공된 실제 비용만 기록하며 누락된 비용은 미확인으로 표시합니다.{" "}
          <a
            className="underline"
            href="https://openrouter.ai/models"
            target="_blank"
            rel="noreferrer"
          >
            모델 요금 확인
          </a>
        </p>
        <label className="mt-5 flex items-start gap-3 text-sm leading-6">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-primary"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          {reuseAnalysis
            ? "기존 분석 사용과 기획 1회 비용 안내를 확인했습니다."
            : "사진 전송과 분석·기획 비용 안내를 확인했습니다."}
        </label>
        <Button
          className="mt-6 w-full"
          disabled={!consent || busy}
          onClick={() =>
            void action(async () => {
              await request(
                `/api/v1/products/${product.id}/plan`,
                {
                  method: "POST",
                  body: JSON.stringify({
                    consent: true,
                    reuseAnalysis,
                    idempotencyKey: requestId.current,
                    presetId: preset || null,
                    description,
                    lookReferenceId: useLook
                      ? (lookReference?.id ?? null)
                      : null,
                    referenceConsent: Boolean(useLook && lookReference),
                  }),
                },
                me.csrf,
              );
              setOpen(false);
            })
          }
        >
          <CheckCircle2 size={16} aria-hidden="true" />
          {reuseAnalysis ? "동의하고 기획만 시작" : "동의하고 분석·기획 시작"}
        </Button>
      </Modal>
    </div>
  );
}
