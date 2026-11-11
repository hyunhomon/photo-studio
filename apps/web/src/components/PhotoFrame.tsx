import type { ReactNode } from "react";
import type { AssetDto } from "@photo-studio/schemas";
import { ZoomIn, Image } from "lucide-react";
import { apiBase } from "../lib/api";
export default function PhotoFrame({
  images,
  selectedId,
  onSelect,
  onZoom,
  alt,
  side,
  children,
  mock = false,
}: {
  images: Pick<AssetDto, "id">[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onZoom: (id: string) => void;
  alt: string;
  side: "original" | "result";
  children?: ReactNode;
  mock?: boolean;
}) {
  const selected = images.find((a) => a.id === selectedId) ?? images[0];
  const url = (id: string) => `${apiBase}/api/v1/assets/${id}/content`;
  return (
    <figure
      className={`photo-frame ${side === "result" ? "result-frame" : ""}`}
      aria-label={side === "original" ? "원본 사진" : "생성 결과"}
    >
      <div className="photo-display">
        {selected ? (
          <img src={url(selected.id)} alt={alt} />
        ) : (
          <Image
            size={28}
            strokeWidth={1}
            className="text-muted"
            aria-label="생성 결과 없음"
          />
        )}
        {mock && (
          <span className="absolute top-2 left-2 rounded bg-surface px-2 py-1 text-[10px] text-muted">
            Mock · 원본 복사
          </span>
        )}
        {children}
      </div>
      <div className="photo-filmstrip">
        <fieldset
          aria-label={side === "original" ? "원본 사진 선택" : "생성 결과 선택"}
        >
          {images.map((a, i) => (
            <button
              type="button"
              key={a.id}
              aria-label={
                side === "original"
                  ? `원본 ${i + 1} 선택`
                  : `결과 ${images.length - i} 선택`
              }
              aria-pressed={selected?.id === a.id}
              onClick={() => onSelect(a.id)}
              className={selected?.id === a.id ? "selected" : ""}
            >
              <img src={url(a.id)} alt="" />
            </button>
          ))}
        </fieldset>
        <button
          type="button"
          disabled={!selected}
          aria-label={
            side === "original" ? "비교 기준 사진 확대" : "결과 사진 확대"
          }
          onClick={() => selected && onZoom(selected.id)}
          className="photo-expand"
        >
          <ZoomIn size={18} />
        </button>
      </div>
    </figure>
  );
}
