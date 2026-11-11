import { useEffect, useState } from "react";
import { ArrowUpRight, ChartNoAxesColumn, Download } from "lucide-react";
import type { UsageDto } from "@photo-studio/schemas";
import { useAccount } from "../lib/account";
import { apiBase, errorMessage, request } from "../lib/api";
import WorkspaceShell from "./WorkspaceShell";
import { jobLabels } from "./PlanningPanel";
const stageLabels: Record<string, string> = {
  analysis: "상품 분석",
  planning: "촬영 기획",
  generation: "이미지 생성",
  evaluation: "품질 평가",
};
const percent = (value: number | null) =>
  value === null ? "—" : `${Math.round(value * 100)}%`;
export default function UsageScreen() {
  const { me, error, setError, state, retry } = useAccount(),
    [data, setData] = useState<UsageDto | null>(null);
  useEffect(() => {
    if (me)
      request<UsageDto>("/api/v1/usage")
        .then(setData)
        .catch((e) => setError(errorMessage(e)));
  }, [me, setError]);
  return (
    <WorkspaceShell
      me={me}
      error={error}
      accountState={state}
      onRetry={retry}
      section="사용 기록"
    >
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="eyebrow text-muted">THE STUDIO, IN NUMBERS</p>
          <h1 className="mt-3 text-3xl">만들고, 고르고, 돌아보기.</h1>
          <p className="mt-4 text-sm text-muted">
            내 작업의 비용과 선택을 한곳에서 확인합니다.
          </p>
        </div>
        <a
          href={`${apiBase}/api/v1/account/export`}
          data-astro-reload
          className="flex min-h-11 items-center gap-2 rounded-full border border-line px-5 py-3 text-xs font-semibold"
        >
          <Download size={15} aria-hidden="true" />내 데이터 내보내기
        </a>
      </div>
      {!data ? (
        <p role="status" className="py-12 text-sm text-muted">
          사용 기록을 확인하고 있습니다…
        </p>
      ) : (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: "확인된 AI 비용 · 부분합",
                value: data.knownCostCount
                  ? `$${data.reportedCostUsd.toFixed(5)}`
                  : "미확인",
                detail: `비용 제공 ${data.knownCostCount}회 / 미확인 ${data.unknownCostCount}회`,
              },
              {
                label: "생성한 컷",
                value: `${data.generated}`,
                detail: `검수용 평가 ${data.evaluated}컷 · 재생성 요청 ${data.regenerations}회`,
              },
              {
                label: "검수한 컷의 채택률",
                value: percent(data.reviewedAcceptanceRate),
                detail: `채택 ${data.accepted} / 폐기 ${data.rejected}`,
              },
              {
                label: "평균 AI 응답 시간",
                value:
                  data.averageLatencyMs === null
                    ? "—"
                    : `${(data.averageLatencyMs / 1000).toFixed(1)}초`,
                detail: `전체 호출 시도 ${data.calls}회 · 응답 미확인 ${data.unknownOutcomes}회`,
              },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-panel border border-line bg-surface p-6"
              >
                <p className="text-xs text-muted">{card.label}</p>
                <p className="mt-5 font-editorial text-3xl">{card.value}</p>
                <p className="mt-4 text-[11px] leading-6 text-muted">
                  {card.detail}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs leading-7 text-muted">
            {data.mock
              ? "Mock 합성 기록입니다. 실제 AI 호출·청구·의류 품질을 측정한 값이 아닙니다."
              : "OpenRouter가 제공한 실제 비용만 집계합니다. 미확인 비용은 합계에 포함되지 않으므로 총 청구액과 다를 수 있습니다. 실제 청구는 OpenRouter에서 확인해 주세요."}{" "}
            프로젝트·결과 삭제 시 관련 기록도 삭제되어 집계가 달라집니다.
          </p>
          <div className="mt-8 grid gap-6 xl:grid-cols-2">
            <section className="rounded-panel border border-line bg-surface p-6">
              <h2 className="flex items-center gap-2 text-lg">
                <ChartNoAxesColumn size={18} aria-hidden="true" />
                단계별 사용
              </h2>
              {!data.stages.length ? (
                <p className="py-8 text-sm text-muted">
                  아직 AI 작업 기록이 없습니다.
                </p>
              ) : (
                <div className="mt-5 space-y-5">
                  {data.stages.map((s) => (
                    <div key={s.stage}>
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <p>
                          {stageLabels[s.stage] ?? s.stage} · {s.calls}회
                        </p>
                        <p>
                          {s.known
                            ? `$${s.reportedCostUsd.toFixed(5)}`
                            : "비용 미확인"}
                        </p>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                        <div
                          className="h-full bg-primary"
                          style={{
                            width: `${(100 * s.calls) / Math.max(1, ...data.stages.map((v) => v.calls))}%`,
                          }}
                        />
                      </div>
                      <p className="mt-1.5 text-[10px] text-muted">
                        실제 비용 제공 {s.known} / {s.calls}회 ·{" "}
                        {s.averageLatencyMs === null
                          ? "시간 미확인"
                          : `평균 ${(s.averageLatencyMs / 1000).toFixed(1)}초`}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section className="rounded-panel border border-line bg-surface p-6">
              <h2 className="text-lg">품질과 선택</h2>
              <dl className="mt-5 space-y-4 text-sm">
                {[
                  {
                    label: "평가된 컷 중 채택률",
                    value: percent(data.evaluatedAcceptanceRate),
                  },
                  {
                    label: "평균 상품 충실도 · AI 참고값",
                    value: percent(data.quality.fidelity),
                  },
                  {
                    label: "평균 자연스러움 · AI 참고값",
                    value: percent(data.quality.realism),
                  },
                  {
                    label: "평균 구도 · AI 참고값",
                    value: percent(data.quality.composition),
                  },
                  {
                    label: "채택 컷당 확인된 비용 · 부분합",
                    value:
                      data.acceptedCostUsd === null
                        ? "—"
                        : `$${data.acceptedCostUsd.toFixed(5)}`,
                  },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="flex items-center justify-between gap-4 border-b border-line pb-3"
                  >
                    <dt className="text-xs text-muted">{s.label}</dt>
                    <dd className="font-semibold">{s.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-5 text-xs leading-7 text-muted">
                평가된 컷 중 채택률은 AI 평가가 있는 컷을 분모로 계산합니다.
                검수한 컷의 채택률은 사람이 채택·폐기를 선택한 컷만 포함합니다.
                AI 점수는 판매 적합성을 보장하지 않습니다.
              </p>
            </section>
          </div>
          <section className="mt-8 overflow-hidden rounded-panel border border-line bg-surface">
            <div className="border-b border-line p-6">
              <h2 className="text-lg">최근 작업</h2>
              <p className="mt-2 text-xs text-muted">
                최근 50개 작업 · 각 호출의 모델·시간·실제 비용은 작업 화면에서
                확인할 수 있습니다.
              </p>
            </div>
            {!data.history.length ? (
              <p className="p-10 text-sm text-muted">
                첫 번째 상품을 등록하고 촬영을 기획해 보세요.
              </p>
            ) : (
              data.history.map((job) => (
                <a
                  key={job.id}
                  href={`/studio/products/${job.productId}`}
                  className="flex flex-wrap items-center gap-4 border-b border-line p-5 transition-colors last:border-b-0 hover:bg-studio"
                >
                  <div className="min-w-36">
                    <p className="text-sm font-semibold">
                      {job.kind === "plan"
                        ? "분석·촬영 기획"
                        : "이미지 생성·검수"}
                    </p>
                    <p className="mt-1.5 text-[11px] text-muted">
                      {new Date(job.createdAt).toLocaleString("ko-KR")}
                    </p>
                  </div>
                  <span className="rounded-full bg-studio px-3 py-1.5 text-[11px]">
                    {jobLabels[job.status] ?? job.status}
                  </span>
                  <p className="ml-auto text-xs text-muted">
                    {job.attempts.filter((a) => a.actualCostUsd !== null).length
                      ? `$${job.attempts.reduce((n, a) => n + (a.actualCostUsd ?? 0), 0).toFixed(5)} (확인분)`
                      : "비용 미확인"}
                  </p>
                  <ArrowUpRight size={16} aria-hidden="true" />
                </a>
              ))
            )}
          </section>
        </>
      )}
    </WorkspaceShell>
  );
}
