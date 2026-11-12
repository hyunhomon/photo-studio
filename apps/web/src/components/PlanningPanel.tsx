import { useCallback, useEffect, useState, useId, useRef } from "react";
import { Clock3, ScanSearch, SlidersHorizontal } from "lucide-react";
import { TabGroup, TabList, Tab, TabPanels, TabPanel } from "@headlessui/react";
import ShotChoice, { framingOptions, angleOptions } from "./ShotChoice";
import type { ReactNode } from "react";
import { Button, Select } from "@photo-studio/ui";
import type {
  JobDto,
  PipelineDto,
  PlanDto,
  PresetDto,
  ProductAnalysis,
  ProductDto,
  ShootPlan,
  StudioDraft,
} from "@photo-studio/schemas";
import { errorMessage, type Me, request } from "../lib/api";
import AutomaticReferencePreview, {
  referenceFailureLabels,
} from "./AutomaticReferencePreview";

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
  reference_search: "레퍼런스 검색",
  review_plan: "콘셉트 확인",
  generation: "이미지 생성",
  evaluation: "품질 평가",
  review: "결과 검수",
};
const failureLabels: Record<string, string> = {
  ...referenceFailureLabels,
  AUTO_REFERENCE_STORAGE_UNCERTAIN:
    "참조 저장 상태를 확인하지 못해 AI 기획을 시작하지 않았습니다. 작업 상태를 확인한 뒤 다시 실행해 주세요.",
  AUTO_REFERENCE_NO_MATCH:
    "사용 조건에 맞는 촬영 레퍼런스를 찾지 못했습니다. 분석은 보존됐으니 기획을 다시 실행하거나 사진을 직접 등록해 주세요.",
  AUTO_REFERENCE_UNAVAILABLE:
    "촬영 레퍼런스 검색에 연결하지 못했습니다. 분석은 보존됐으며 잠시 후 기획만 다시 실행할 수 있습니다.",
  AUTO_REFERENCE_RATE_LIMITED:
    "촬영 레퍼런스 검색 요청이 많습니다. 잠시 후 기획만 다시 실행해 주세요.",
  AUTO_REFERENCE_NO_ELIGIBLE_IMAGE:
    "사용 조건에 맞는 촬영 레퍼런스를 찾지 못했습니다. 기획을 다시 실행하거나 사진을 직접 등록해 주세요.",
  AUTO_REFERENCE_SOURCE_UNAVAILABLE:
    "촬영 레퍼런스 검색에 연결하지 못했습니다. 잠시 후 기획만 다시 실행해 주세요.",
  AUTO_REFERENCE_IMAGE_TOO_LARGE:
    "촬영 레퍼런스 사진의 크기를 확인하지 못했습니다. 기획을 다시 실행하거나 사진을 직접 등록해 주세요.",
  AUTO_REFERENCE_IN_PROGRESS:
    "이 요청의 레퍼런스 검색이 이미 시작됐습니다. 진행 상태를 확인해 주세요.",
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
      {job.status === "failed" &&
        !(job.errorCode && job.errorCode in referenceFailureLabels) &&
        ["planning", "reference_search"].includes(job.stage) && (
          <p className="mt-2 text-xs leading-6 text-muted">
            완료된 상품 분석은 보존했습니다. ‘기획만 재생성’로 이어갈 수
            있습니다.
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
    <label
      htmlFor={id}
      className="block min-w-0 text-xs font-medium text-muted"
    >
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
  onChange,
  busy,
}: {
  analysis: ProductAnalysis;
  onChange: (a: ProductAnalysis) => void;
  busy: boolean;
}) {
  const value = analysis,
    setValue = onChange;
  return (
    <section className="rounded-panel border border-line bg-surface p-6">
      <fieldset disabled={busy} className="min-w-0">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg">상품 이해</h2>
        </div>
        <fieldset disabled={busy} className="grid min-w-0 grid-cols-1 gap-4">
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
        </fieldset>
        <div className="mt-4 grid min-w-0 grid-cols-1 gap-4">
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
            onChange={(v) =>
              setValue({ ...value, uncertainties: v.split("\n") })
            }
          />
        </div>
      </fieldset>
    </section>
  );
}
export function PlanEditor({
  plan,
  onChange,
  busy,
  automaticReference = false,
}: {
  plan: PlanDto;
  onChange: (spec: ShootPlan) => void;
  busy: boolean;
  automaticReference?: boolean;
}) {
  const v = plan.spec,
    set = onChange;
  return (
    <section className="rounded-panel border border-line bg-surface p-6">
      <fieldset disabled={busy} className="min-w-0">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl">촬영 콘셉트</h2>
          <span className="rounded-full border border-line px-3 py-1.5 text-[10px]">
            V{plan.version}
          </span>
        </div>
        {plan.spec.referenceNotes && (
          <div className="my-5 border-l-2 border-line pl-3 text-xs leading-6 text-muted">
            <strong className="mb-1 block font-medium text-ink">
              레퍼런스 관찰
            </strong>
            {plan.spec.referenceNotes}
          </div>
        )}

        <fieldset
          disabled={busy}
          className="mt-5 grid min-w-0 grid-cols-1 gap-4"
        >
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
          <ShotChoice
            choices={framingOptions}
            label="프레이밍"
            value={v.camera.framing}
            onChange={(s) => set({ ...v, camera: { ...v.camera, framing: s } })}
          />
          <ShotChoice
            choices={angleOptions}
            label="카메라 각도"
            value={v.camera.angle}
            onChange={(s) => set({ ...v, camera: { ...v.camera, angle: s } })}
          />
          <Field
            label="장소"
            value={v.location.type}
            onChange={(s) =>
              set({ ...v, location: { ...v.location, type: s } })
            }
          />
          <Field
            label="시간대"
            value={v.location.time}
            onChange={(s) =>
              set({ ...v, location: { ...v.location, time: s } })
            }
          />
          <Field
            label="조명"
            value={v.lighting}
            onChange={(s) => set({ ...v, lighting: s })}
          />
        </fieldset>
        {plan.lookReferenceId && !automaticReference && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-muted">레퍼런스 반영</p>
            <Select
              label="레퍼런스 반영"
              value={v.camera.referenceComposition}
              onChange={(mode) =>
                set({
                  ...v,
                  camera: {
                    ...v.camera,
                    referenceComposition: mode as "match" | "inspire",
                  },
                })
              }
              options={[
                { value: "match", label: "구도·포즈·배경 배치 그대로" },
                { value: "inspire", label: "빛·톤만 참고" },
              ]}
            />
          </div>
        )}
        <div className="mt-5 grid min-w-0 grid-cols-1 gap-4">
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
      </fieldset>
    </section>
  );
}
export default function PlanningPanel({
  product,
  me,
  onRefresh,
  onPipeline,
  referencesPanel,
  draft,
  onDraft,
  executionPending,
}: {
  product: ProductDto;
  me: Me;
  onRefresh: () => void;
  onPipeline?: (data: PipelineDto) => void;
  referencesPanel?: ReactNode;
  executionPending: boolean;
  draft: StudioDraft;
  onDraft: (value: StudioDraft) => void;
}) {
  const requestId = useRef(crypto.randomUUID());
  const refreshSequence = useRef(0);
  const scroll = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState(0);
  const [referenceMode, setReferenceMode] = useState<
    "automatic" | "manual" | "none" | null
  >(null);
  const lookReference = product.assets.find((a) => a.kind === "look_reference");
  const selectedReferenceMode =
    referenceMode === "manual" && !lookReference
      ? "automatic"
      : (referenceMode ?? (lookReference ? "manual" : "automatic"));
  const [data, setData] = useState<PipelineDto>({ plans: [], jobs: [] }),
    [presets, setPresets] = useState<PresetDto[]>([]),
    [preset, setPreset] = useState(""),
    [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    try {
      const d = await request<PipelineDto>(
        `/api/v1/products/${product.id}/pipeline`,
      );
      if (sequence !== refreshSequence.current) return;
      setData(d);
      onPipeline?.(d);
    } catch (e) {
      if (sequence === refreshSequence.current) throw e;
    }
  }, [product.id, onPipeline]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: parent refresh signals a mutation made in the separate generation panel.
  useEffect(() => {
    void refresh().catch((e) => setError(errorMessage(e)));
    return () => {
      refreshSequence.current++;
    };
  }, [refresh, product]);
  useEffect(() => {
    request<PresetDto[]>("/api/v1/presets")
      .then(setPresets)
      .catch((e) => setError(errorMessage(e)));
  }, []);
  const active =
    executionPending ||
    data.jobs.some((j) => ["queued", "running"].includes(j.status));
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
  function start(reuseAnalysis: boolean) {
    requestId.current = crypto.randomUUID();
    void action(() =>
      request(
        `/api/v1/products/${product.id}/plan`,
        {
          method: "POST",
          body: JSON.stringify({
            consent: true,
            reuseAnalysis,
            editedAnalysis: reuseAnalysis ? draft.analysis : undefined,
            idempotencyKey: requestId.current,
            presetId: preset || null,
            description,
            lookReferenceId:
              selectedReferenceMode === "manual"
                ? (lookReference?.id ?? null)
                : null,
            useAutomaticReference: selectedReferenceMode === "automatic",
            personReferenceId:
              product.assets.find((a) => a.kind === "person_reference")?.id ??
              null,
            referenceConsent: true,
          }),
        },
        me.csrf,
      ),
    );
  }
  const plan = data.plans[0];
  const latestPlanningJob = data.jobs.find((job) => job.kind === "plan");
  const latestReference = data.retrievals?.find(
    (reference) => reference.jobId === latestPlanningJob?.id,
  );
  const planReference = data.retrievals?.find(
    (reference) =>
      reference.status === "selected" &&
      reference.assetId &&
      reference.assetId === plan?.lookReferenceId,
  );
  useEffect(() => {
    if (plan?.id) setTab(2);
  }, [plan?.id]);
  useEffect(() => {
    // Start a selected or newly generated concept at its beginning, without moving the document.
    if (tab === 2 && !plan?.id) return;
    if (scroll.current) scroll.current.scrollTop = 0;
  }, [tab, plan?.id]);
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
      <TabGroup selectedIndex={tab} onChange={setTab} className="planning-tabs">
        <TabList className="sticky top-[76px] z-10 grid shrink-0 grid-cols-3 lg:top-0 gap-1 border-b border-line bg-surface p-3">
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
        <TabPanels ref={scroll} className="planning-scroll">
          <TabPanel unmount={false} className="space-y-5 p-5">
            <section className="space-y-4">
              <div className="mt-4 flex items-center gap-3">
                <ScanSearch size={22} aria-hidden="true" />
                <h2 className="text-xl">한 벌을 위한 촬영 기획</h2>
              </div>

              <div className="mt-5 grid min-w-0 grid-cols-1 gap-4">
                <Select
                  label="기획 레퍼런스"
                  value={selectedReferenceMode}
                  onChange={(value) =>
                    setReferenceMode(value as "automatic" | "manual" | "none")
                  }
                  options={[
                    { value: "automatic", label: "상품에 맞는 사진 자동 검색" },
                    ...(lookReference
                      ? [{ value: "manual", label: "등록한 촬영 구도로 기획" }]
                      : []),
                    { value: "none", label: "참조 없이 기획" },
                  ]}
                />
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
              <fieldset
                className="planning-actions mt-5 flex gap-2"
                aria-label="기획 실행"
              >
                <Button
                  className={
                    product.analysis ? "min-w-0 flex-1 px-3" : "w-full"
                  }
                  variant={product.analysis ? "secondary" : "primary"}
                  disabled={busy || active}
                  onClick={() => start(false)}
                >
                  {!product.analysis && (
                    <SlidersHorizontal size={15} aria-hidden="true" />
                  )}
                  {product.analysis ? "상품 재분석·기획" : "분석 시작"}
                </Button>
                {product.analysis && (
                  <Button
                    className="min-w-0 flex-1 px-3"
                    variant="secondary"
                    disabled={busy || active}
                    onClick={() => start(true)}
                  >
                    기획만 재생성
                  </Button>
                )}
              </fieldset>
              {me.mode === "mock" && (
                <p className="text-xs text-muted">Mock · 외부 비용 없음</p>
              )}
            </section>
            <AutomaticReferencePreview reference={latestReference} />
            {referencesPanel}
          </TabPanel>
          <TabPanel unmount={false} className="p-5">
            {product.analysis && (
              <AnalysisEditor
                key={JSON.stringify(product.analysis)}
                analysis={draft.analysis ?? product.analysis}
                busy={busy || active}
                onChange={(analysis) =>
                  onDraft({
                    ...draft,
                    analysis,
                    analysisBase: JSON.stringify(product.analysis),
                  })
                }
              />
            )}
          </TabPanel>
          <TabPanel unmount={false} className="p-5">
            {planReference && (
              <div className="mb-5">
                <AutomaticReferencePreview reference={planReference} />
              </div>
            )}
            {plan && (
              <PlanEditor
                key={`${plan.id}-${plan.status}`}
                plan={{
                  ...plan,
                  spec:
                    draft.planId === plan.id
                      ? (draft.spec ?? plan.spec)
                      : plan.spec,
                }}
                busy={busy || active}
                automaticReference={Boolean(planReference)}
                onChange={(spec) =>
                  onDraft({ ...draft, planId: plan.id, spec })
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
    </div>
  );
}
