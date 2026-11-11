import { useEffect, useState } from "react";
import { LoaderCircle, Check } from "lucide-react";
import type { JobDto } from "@photo-studio/schemas";
import { Button } from "@photo-studio/ui";
export default function WorkPending({
  job,
  onDispatch,
}: {
  job: JobDto;
  onDispatch: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const stages =
    job.kind === "generate"
      ? [["generation", "이미지 생성"]]
      : [
          ["analysis", "상품 이해"],
          ["planning", "촬영 기획"],
        ];
  return (
    <div
      className="work-pending"
      role="status"
      aria-label={
        job.kind === "generate"
          ? "이미지를 생성하고 있습니다"
          : "촬영 기획을 만들고 있습니다"
      }
      aria-busy="true"
    >
      <div className="relative mx-auto flex max-w-xs flex-col items-center px-5 text-center">
        <div className="mb-6 grid size-20 place-items-center rounded-3xl border border-primary/20 bg-primary/10 text-primary">
          <LoaderCircle
            size={33}
            strokeWidth={1.5}
            className="motion-safe:animate-spin"
            aria-hidden="true"
          />
        </div>
        <h3 className="text-xl font-semibold">
          {job.kind === "generate"
            ? "다음 컷을 촬영하고 있어요"
            : "옷에 맞는 장면을 찾고 있어요"}
        </h3>
        <p className="mt-3 text-sm leading-7 text-muted">
          {job.kind === "generate"
            ? "선택한 사진과 승인한 콘셉트를 반영하고 있어요."
            : "사진을 살펴보고 빛과 구도, 분위기를 기획해요."}
        </p>
        <ol className="mt-6 flex flex-wrap justify-center gap-2">
          {stages.map(([key, label]) => (
            <li
              key={key}
              className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs ${job.stage === key ? "border-primary/40 text-primary" : "border-line text-muted"}`}
            >
              {job.attempts.find((a) => a.stage === key)?.status ===
                "succeeded" && <Check size={12} aria-hidden="true" />}
              {label}
            </li>
          ))}
        </ol>
        <span
          className="mt-5 text-xs tabular-nums text-muted"
          aria-hidden="true"
        >
          {Math.max(0, Math.floor((now - job.createdAt) / 1000))}초 경과
        </span>
        <p className="mt-4 text-[11px] leading-5 text-muted">
          이동해도 작업은 이어집니다.
          <br />
          결과가 불확실하면 자동으로 다시 생성하지 않아요.
        </p>
        {job.errorCode === "DISPATCH_PENDING" && (
          <Button className="mt-5" variant="secondary" onClick={onDispatch}>
            작업 연결 재확인
          </Button>
        )}
      </div>
    </div>
  );
}
