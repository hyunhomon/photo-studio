import { useEffect, useState } from "react";
import { Plus, SlidersHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button, Modal, Select } from "@photo-studio/ui";
import type { PresetDto, PresetInput } from "@photo-studio/schemas";
import { useAccount } from "../lib/account";
import { errorMessage, request } from "../lib/api";
import WorkspaceShell from "./WorkspaceShell";

const initial: PresetInput = {
  name: "",
  season: "spring-summer",
  mood: "미니멀 에디토리얼",
  modelStyle: "성인 커머셜 패션 모델",
  location: "밝은 무채색 스튜디오",
  lighting: "부드러운 확산광",
  modelAppearance: "",
  backgroundSeparation: "gentle",
  materialDirection: "",
};
export default function PresetScreen() {
  const { me, error, setError, state, retry } = useAccount();
  const [items, setItems] = useState<PresetDto[]>([]),
    [form, setForm] = useState(initial),
    [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [remove, setRemove] = useState<PresetDto | null>(null);
  useEffect(() => {
    if (me)
      request<PresetDto[]>("/api/v1/presets")
        .then(setItems)
        .catch((e) => setError(errorMessage(e)));
  }, [me, setError]);
  async function save() {
    if (!me) return;
    setBusy(true);
    try {
      const item = await request<PresetDto>(
        editing ? `/api/v1/presets/${editing}` : "/api/v1/presets",
        { method: editing ? "PATCH" : "POST", body: JSON.stringify(form) },
        me.csrf,
      );
      setItems((previous) => [
        item,
        ...previous.filter((p) => p.id !== item.id),
      ]);
      setOpen(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function drop() {
    if (!me || !remove) return;
    setBusy(true);
    try {
      await request(
        `/api/v1/presets/${remove.id}`,
        { method: "DELETE" },
        me.csrf,
      );
      setItems((previous) => previous.filter((p) => p.id !== remove.id));
      setRemove(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <WorkspaceShell
      me={me}
      error={error}
      accountState={state}
      onRetry={retry}
      section="브랜드 프리셋"
    >
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="mt-3 text-3xl sm:text-4xl">브랜드 프리셋</h1>
        </div>
        <Button
          onClick={() => {
            setForm(initial);
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus size={16} aria-hidden="true" />새 프리셋
        </Button>
      </div>
      {items.length ? (
        <div className="mt-9 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <article
              key={item.id}
              className="rounded-panel border border-line bg-surface p-6"
            >
              <h2 className="mt-4 text-xl">{item.name}</h2>
              <p className="mt-4 text-sm leading-7 text-muted">{item.mood}</p>
              <dl className="mt-5 space-y-3 border-t border-line pt-4 text-xs text-muted">
                <div>
                  <dt className="inline font-semibold">모델 </dt>
                  <dd className="inline">{item.modelStyle}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold">장소 </dt>
                  <dd className="inline">{item.location}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold">빛 </dt>
                  <dd className="inline">{item.lighting}</dd>
                </div>
              </dl>
              <div className="mt-6 flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    const { id, updatedAt: _updatedAt, ...spec } = item;
                    setForm(spec);
                    setEditing(id);
                    setOpen(true);
                  }}
                >
                  <Pencil size={13} aria-hidden="true" />
                  수정
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setRemove(item)}
                  aria-label={`${item.name} 삭제`}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-9 grid min-h-80 place-items-center rounded-panel border border-dashed border-line p-8 text-center">
          <div>
            <SlidersHorizontal
              size={32}
              strokeWidth={1}
              className="mx-auto"
              aria-hidden="true"
            />
            <h2 className="mt-5 text-xl">아직 프리셋이 없어요.</h2>
          </div>
        </div>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "프리셋 수정" : "새 브랜드 프리셋"}
        description=""
      >
        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          {(
            [
              ["name", "프리셋 이름"],
              ["season", "시즌"],
              ["mood", "브랜드 무드"],
              ["modelStyle", "성인 모델 스타일"],
              ["location", "장소"],
              ["lighting", "조명"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <label
                htmlFor={`preset-${key}`}
                className="mb-1.5 block text-xs font-semibold"
              >
                {label}
              </label>
              <input
                className="studio-input"
                id={`preset-${key}`}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                required
                maxLength={key === "name" ? 120 : key === "season" ? 80 : 300}
              />
            </div>
          ))}
          <Select
            label="배경 분리"
            value={form.backgroundSeparation}
            onChange={(value) =>
              setForm({
                ...form,
                backgroundSeparation:
                  value as PresetInput["backgroundSeparation"],
              })
            }
            options={[
              { value: "gentle", label: "은은하게" },
              { value: "balanced", label: "자연스럽게" },
              { value: "separated", label: "분리감 있게" },
            ]}
          />
          <label className="block text-xs">
            인물 인상 (성인 · 선택)
            <textarea
              className="studio-input mt-2 min-h-20"
              maxLength={500}
              value={form.modelAppearance}
              onChange={(e) =>
                setForm({ ...form, modelAppearance: e.target.value })
              }
            />
          </label>
          <label className="block text-xs">
            소재 표현 지시 (선택)
            <textarea
              className="studio-input mt-2 min-h-20"
              maxLength={500}
              value={form.materialDirection}
              onChange={(e) =>
                setForm({ ...form, materialDirection: e.target.value })
              }
            />
          </label>
          <Button type="submit" disabled={busy} className="w-full">
            프리셋 저장
          </Button>
        </form>
      </Modal>
      <Modal
        open={Boolean(remove)}
        onClose={() => setRemove(null)}
        title="프리셋을 삭제할까요?"
        description="저장된 프리셋만 삭제하며, 기존 촬영 계획과 결과는 유지됩니다."
      >
        <div className="mt-6 flex gap-3">
          <Button variant="secondary" onClick={() => setRemove(null)}>
            취소
          </Button>
          <Button onClick={() => void drop()} disabled={busy}>
            삭제
          </Button>
        </div>
      </Modal>
    </WorkspaceShell>
  );
}
