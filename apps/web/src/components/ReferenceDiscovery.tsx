import { useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { Modal, Select } from "@photo-studio/ui";
import {
  pinterestSearchUrl,
  referenceSearchStyles,
} from "../lib/reference-discovery";

export default function ReferenceDiscovery({ garment }: { garment: string }) {
  const [open, setOpen] = useState(false),
    [style, setStyle] = useState("catalog");
  return (
    <>
      <button
        type="button"
        className="mt-3 inline-flex max-w-full items-center gap-2 text-left text-xs font-medium text-muted hover:text-ink"
        onClick={() => setOpen(true)}
      >
        <Search size={14} className="shrink-0" aria-hidden="true" />
        <span className="min-w-0">Pinterest에서 찾기</span>
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="촬영 레퍼런스 찾기"
        description="Pinterest에서 검색한 뒤 사용권 있는 원본 사진을 등록해 주세요. 검색 결과를 자동 수집하지 않습니다."
      >
        <div className="mt-5 space-y-5">
          <Select
            label="찾을 촬영 스타일"
            value={style}
            onChange={setStyle}
            options={referenceSearchStyles.map(({ value, label }) => ({
              value,
              label,
            }))}
          />
          <a
            href={pinterestSearchUrl(garment, style)}
            target="_blank"
            rel="noopener noreferrer"
            className="studio-button inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-primary bg-primary px-6 py-3 text-sm font-semibold text-on-primary hover:bg-primary-hover"
          >
            Pinterest 검색 열기
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </div>
      </Modal>
    </>
  );
}
