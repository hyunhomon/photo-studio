import { useState } from "react";
import { navigate } from "astro:transitions/client";
import { ArrowUp, LoaderCircle, Plus } from "lucide-react";
import { Button, Modal } from "@photo-studio/ui";
import type { ProjectDto } from "@photo-studio/schemas";
import { request, errorMessage, type Me } from "../lib/api";

export function ProjectComposer({
  me,
  compact = false,
}: {
  me: Me;
  compact?: boolean;
}) {
  const [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [notes, setNotes] = useState(compact);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function create() {
    if (busy || !name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const project = await request<ProjectDto>(
        "/api/v1/projects",
        { method: "POST", body: JSON.stringify({ name, description }) },
        me.csrf,
      );
      await navigate(`/studio/projects/${project.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
        className={
          compact
            ? "mt-6 space-y-5"
            : "project-composer rounded-2xl border border-control bg-surface p-4 shadow-[0_12px_48px_rgb(0_0_0/12%)] sm:p-5"
        }
      >
        <label
          htmlFor={compact ? "project-name" : "start-project-name"}
          className={compact ? "mb-2 block text-xs font-semibold" : "sr-only"}
        >
          {compact ? "프로젝트 이름" : "새 프로젝트 이름"}
        </label>
        <input
          id={compact ? "project-name" : "start-project-name"}
          className={
            compact
              ? "studio-input"
              : "min-h-12 w-full bg-transparent px-1 text-base outline-none placeholder:text-muted/70 focus:outline-none"
          }
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={120}
          disabled={busy}
          placeholder="어떤 컬렉션을 준비하고 있나요?"
          autoComplete="off"
        />
        {notes && (
          <div className={compact ? "" : "mt-3"}>
            <label
              htmlFor={
                compact ? "project-description" : "start-project-description"
              }
              className={
                compact ? "mb-2 block text-xs font-semibold" : "sr-only"
              }
            >
              간단한 설명 (선택)
            </label>
            <textarea
              id={compact ? "project-description" : "start-project-description"}
              className={
                compact
                  ? "studio-input min-h-24"
                  : "min-h-20 w-full resize-y rounded-lg bg-paper/50 p-3 text-sm outline-none placeholder:text-muted/70"
              }
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
              placeholder="시즌, 브랜드 무드, 촬영 목적을 메모하세요."
              disabled={busy}
            />
          </div>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
        {compact ? (
          <Button
            type="submit"
            className="w-full"
            disabled={busy || !name.trim()}
          >
            {busy ? "만드는 중…" : "프로젝트 만들기"}
          </Button>
        ) : (
          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setNotes(!notes)}
              aria-expanded={notes}
              className="flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-xs text-muted hover:bg-studio hover:text-ink"
            >
              <Plus size={16} aria-hidden="true" />
              메모 {notes ? "접기" : "추가"}
            </button>
            <button
              type="submit"
              aria-label="프로젝트 시작"
              disabled={busy || !name.trim()}
              className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-studio disabled:text-muted"
            >
              {busy ? (
                <LoaderCircle
                  className="motion-safe:animate-spin"
                  size={20}
                  aria-hidden="true"
                />
              ) : (
                <ArrowUp size={20} aria-hidden="true" />
              )}
            </button>
          </div>
        )}
      </form>
      {!compact && (
        <fieldset
          className="mt-4 flex flex-wrap justify-center gap-2"
          aria-label="프로젝트 이름 제안"
        >
          {["시즌 컬렉션", "스튜디오 룩북", "브랜드 캠페인"].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setName(s)}
              className="rounded-full border border-line px-3.5 py-2 text-xs text-muted transition-colors hover:border-control hover:text-ink"
            >
              {s}
            </button>
          ))}
        </fieldset>
      )}
    </>
  );
}
export function NewProjectDialog({
  me,
  open,
  onClose,
}: {
  me: Me;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="새 프로젝트"
      description="컬렉션이나 촬영별로 작업을 모아두세요. 프로젝트 생성은 AI를 실행하지 않습니다."
    >
      <ProjectComposer key={String(open)} me={me} compact />
    </Modal>
  );
}
