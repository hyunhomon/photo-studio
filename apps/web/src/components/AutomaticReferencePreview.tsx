import { ExternalLink } from "lucide-react";
import type { AutomaticReferenceDto } from "@photo-studio/schemas";
import { apiBase } from "../lib/api";

export default function AutomaticReferencePreview({
  reference,
}: {
  reference?: AutomaticReferenceDto;
}) {
  if (!reference) return null;
  if (reference.status === "searching")
    return (
      <section
        aria-label="자동 레퍼런스 검색 결과"
        className="rounded-xl border border-line bg-studio p-4 text-xs text-muted"
      >
        <p>상품에 맞는 촬영 레퍼런스를 찾고 있어요.</p>
      </section>
    );
  if (reference.status === "failed")
    return (
      <section
        aria-label="자동 레퍼런스 검색 결과"
        className="rounded-xl border border-line bg-studio p-4 text-xs leading-6 text-muted"
      >
        <p className="font-medium text-ink">촬영 레퍼런스를 찾지 못했어요</p>
        <p>
          상품 분석은 보존됐습니다. 기획을 다시 실행하거나 직접 등록한 사진을
          사용할 수 있어요.
        </p>
      </section>
    );
  if (!reference.assetId) return null;
  const mock = reference.provider === "mock";
  return (
    <section
      aria-label="자동 레퍼런스 검색 결과"
      className="min-w-0 rounded-xl border border-line bg-studio p-4"
    >
      <div className="mb-3 flex items-center justify-between gap-3 text-xs">
        <h3 className="font-semibold">찾은 촬영 레퍼런스</h3>
        <span className="text-muted">
          {mock ? "Mock · 합성 참조" : "Wikimedia Commons"}
        </span>
      </div>
      <img
        src={`${apiBase}/api/v1/assets/${reference.assetId}/content`}
        alt="자동으로 찾은 촬영 레퍼런스"
        className="max-h-64 w-full rounded-lg object-contain"
      />
      {!mock && (
        <div className="mt-3 space-y-1 text-xs leading-5 text-muted">
          <p className="break-words font-medium text-ink">
            {reference.title ?? "촬영 환경 사진"}
          </p>
          {reference.creator && (
            <p className="break-words">{reference.creator}</p>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {reference.sourcePage && (
              <a
                href={reference.sourcePage}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline"
              >
                원본 출처
                <ExternalLink size={12} aria-hidden="true" />
              </a>
            )}
            {reference.licenseUrl && (
              <a
                href={reference.licenseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {reference.license ?? "사용권"}
              </a>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
