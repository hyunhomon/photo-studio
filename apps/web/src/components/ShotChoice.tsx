import { Select } from "@photo-studio/ui";
export const framingOptions = [
  "레퍼런스 프레이밍 유지",
  "전신 샷",
  "머리부터 허벅지까지",
  "미디엄 샷 · 허리 위",
  "바스트 샷 · 가슴 위",
  "의류 디테일 클로즈업",
];
export const angleOptions = [
  "레퍼런스 시점 유지",
  "아이 레벨 · 눈높이",
  "로우 앵글 · 아래에서 위로",
  "하이 앵글 · 위에서 비스듬히",
  "버드아이 뷰 · 수직으로 내려다보기",
  "더치 앵글 · 카메라 기울임",
  "사이드 뷰 · 옆모습",
];
export default function ShotChoice({
  label,
  value,
  onChange,
  choices,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  choices: string[];
}) {
  const custom = !choices.includes(value);
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted">{label}</p>
      <Select
        label={label}
        value={custom ? "custom" : value}
        onChange={(v) => onChange(v === "custom" ? "" : v)}
        options={[
          ...choices.map((v) => ({ value: v, label: v })),
          { value: "custom", label: "직접 입력" },
        ]}
      />
      {custom && (
        <label className="mt-2 block text-xs text-muted">
          <span className="sr-only">{label} 직접 입력</span>
          <input
            className="studio-input mt-2"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            maxLength={500}
          />
        </label>
      )}
    </div>
  );
}
