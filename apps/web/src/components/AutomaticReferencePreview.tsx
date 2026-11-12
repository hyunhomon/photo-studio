import { ExternalLink } from "lucide-react";
import type { AutomaticReferenceDto } from "@photo-studio/schemas";
import { apiBase } from "../lib/api";

export const referenceFailureLabels: Record<string, string> = {
  SHUTTERSTOCK_FREE_SUBSCRIPTION_REQUIRED:
    "무료 사진 이용권을 확인하지 못해 참조 검색을 중단했습니다. 운영자 확인이 필요합니다.",
  SHUTTERSTOCK_FREE_QUOTA_EXHAUSTED:
    "무료 사진 검색 한도에 도달했습니다. 한도가 갱신된 뒤 다시 실행하거나 사진을 직접 등록해 주세요.",
  SHUTTERSTOCK_RATE_LIMITED:
    "사진 검색 서비스의 요청 한도에 도달했습니다. 잠시 후 다시 실행해 주세요.",
  SHUTTERSTOCK_NOT_CONFIGURED:
    "자동 착용컷 검색 설정이 준비되지 않았습니다. 직접 등록한 사진을 사용할 수 있습니다.",
  SHUTTERSTOCK_AGREEMENT_REQUIRED:
    "자동 착용컷의 사용 조건을 확인 중입니다. 직접 등록한 사진을 사용해 주세요.",
  SHUTTERSTOCK_AUTH_FAILED:
    "착용컷 검색 서비스의 인증을 확인하지 못했습니다. 운영자 확인이 필요합니다.",
  SHUTTERSTOCK_SUBSCRIPTION_INVALID:
    "착용컷 검색 서비스의 이용권을 확인하지 못했습니다. 운영자 확인이 필요합니다.",
  SHUTTERSTOCK_NO_ELIGIBLE_IMAGE:
    "사용 조건에 맞는 착용컷을 찾지 못했습니다. 기획을 다시 실행하거나 사진을 직접 등록해 주세요.",
  SHUTTERSTOCK_LICENSE_UNCERTAIN:
    "참조 사진의 사용권 발급 여부가 불확실합니다. Shutterstock 비용이 발생했을 수 있어 자동 재요청하지 않습니다. 운영자 확인이 필요합니다.",
  SHUTTERSTOCK_LICENSED_REFERENCE_UNAVAILABLE:
    "참조 사용권은 발급됐지만 사진을 준비하지 못했습니다. 중복 발급을 막기 위해 작업을 중단했습니다. 운영자 확인이 필요합니다.",
  SHUTTERSTOCK_LICENSE_REJECTED:
    "참조 사진의 사용권을 발급받지 못했습니다. 운영자 확인이 필요합니다.",
  SHUTTERSTOCK_SOURCE_UNAVAILABLE:
    "착용컷 검색 서비스에 연결하지 못했습니다. 잠시 후 기획만 다시 실행해 주세요.",
  SHUTTERSTOCK_POLICY_CHANGED:
    "참조 사진의 사용 조건이 변경되어 작업을 중단했습니다. 운영자 확인이 필요합니다.",
  PROVIDER_PRIVACY_UNSUPPORTED:
    "이 참조를 처리할 수 있는 비학습 AI 경로를 확인하지 못해 호출하지 않았습니다. 운영자 확인이 필요합니다.",
};

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
        <p className="font-medium text-ink">
          촬영 레퍼런스를 준비하지 못했어요
        </p>
        <p>
          {(reference.failureCode &&
            referenceFailureLabels[reference.failureCode]) ||
            "상품 분석은 보존됐습니다. 기획을 다시 실행하거나 직접 등록한 사진을 사용할 수 있어요."}
        </p>
      </section>
    );
  if (!reference.assetId) return null;
  const mock = reference.provider === "mock";
  const shutterstock = reference.provider === "shutterstock";
  return (
    <section
      aria-label="자동 레퍼런스 검색 결과"
      className="min-w-0 rounded-xl border border-line bg-studio p-4"
    >
      <div className="mb-3 flex items-center justify-between gap-3 text-xs">
        <h3 className="font-semibold">찾은 촬영 레퍼런스</h3>
        <span className="text-muted">
          {mock
            ? "Mock · 합성 참조"
            : shutterstock
              ? "Powered by Shutterstock"
              : "Wikimedia Commons"}
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
            {reference.title ??
              (shutterstock ? "촬영 착용컷 참조" : "촬영 환경 사진")}
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
