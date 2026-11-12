import { AppError } from "./errors";

/** A user-supplied provenance URL, never a URL to fetch or send to a model. */
export function canonicalPinUrl(value: FormDataEntryValue | null) {
  if (value === null || value === "") return null;
  try {
    if (typeof value !== "string" || value.length > 300) throw new Error();
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !["pinterest.com", "www.pinterest.com", "kr.pinterest.com"].includes(
        url.hostname,
      )
    )
      throw new Error();
    const match = /^\/pin\/(\d{5,30})\/?$/.exec(url.pathname);
    if (!match) throw new Error();
    return `https://www.pinterest.com/pin/${match[1]}/`;
  } catch {
    throw new AppError(
      "INVALID_PIN_URL",
      "Pinterest의 전체 핀 주소를 입력해 주세요. 단축 주소는 사용할 수 없습니다.",
    );
  }
}

export interface ReferenceSource {
  assetId: string;
  role: "person_reference" | "look_reference";
  discovery:
    | "user_upload"
    | "pinterest_manual"
    | "wikimedia_commons"
    | "shutterstock"
    | "mock_automatic";
  sourceUrl: string | null;
  creator?: string | null;
  license?: string | null;
  licenseUrl?: string | null;
}
export function referenceSource(
  assetId: string,
  role: ReferenceSource["role"],
  sourceUrl: string | null,
): ReferenceSource {
  return {
    assetId,
    role,
    discovery: sourceUrl ? "pinterest_manual" : "user_upload",
    sourceUrl,
  };
}
