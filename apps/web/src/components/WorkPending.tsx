import { LoaderCircle, ChevronRight } from "lucide-react";
import type { JobDto } from "@photo-studio/schemas";
import { Button } from "@photo-studio/ui";
export default function WorkPending({
  job,
  onDispatch,
}: {
  job: JobDto;
  onDispatch: () => void;
}) {
  const stages =
    job.kind === "generate"
      ? [["generation", "이미지 생성"]]
      : [
          ["analysis", "상품 이해"],
          ...(job.useAutomaticReference || job.stage === "reference_search"
            ? [["reference_search", "레퍼런스 검색"]]
            : []),
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
      <div className="relative mx-auto flex max-w-xs flex-col items-center px-2 py-3 text-center">
        <LoaderCircle
          size={34}
          strokeWidth={1.5}
          className="mb-5 text-primary motion-safe:animate-spin"
          aria-hidden="true"
        />
        <h3 className="text-lg font-semibold">
          {job.kind === "generate"
            ? "다음 컷을 촬영하고 있어요"
            : "옷에 맞는 장면을 찾고 있어요"}
        </h3>
        <ol
          className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm"
          aria-label="진행 단계"
        >
          {stages.map(([key, label], index) => {
            const completed =
              stages.findIndex(([stage]) => stage === job.stage) > index ||
              job.attempts.some(
                (attempt) =>
                  attempt.stage === key && attempt.status === "succeeded",
              );
            const current = job.stage === key;
            return (
              <li key={key} className="flex items-center gap-2">
                {index > 0 && (
                  <ChevronRight
                    size={13}
                    className="text-muted"
                    aria-hidden="true"
                  />
                )}
                <span
                  className={
                    completed || current ? "text-primary" : "text-muted"
                  }
                  aria-current={current ? "step" : undefined}
                >
                  {label}
                </span>
              </li>
            );
          })}
        </ol>
        {job.errorCode === "DISPATCH_PENDING" && (
          <Button className="mt-5" variant="secondary" onClick={onDispatch}>
            작업 연결 재확인
          </Button>
        )}
      </div>
    </div>
  );
}
