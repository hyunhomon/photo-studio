import { useEffect, useState } from "react";
import { Button, Modal } from "@photo-studio/ui";
import { ArrowUpRight, FolderPlus, Plus, FolderOpen } from "lucide-react";
import type { ProjectDto } from "@photo-studio/schemas";
import { useAccount } from "../lib/account";
import { errorMessage, request } from "../lib/api";
import WorkspaceShell from "./WorkspaceShell";

export default function Studio() {
  const { me, error, setError } = useAccount();
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!me) return;
    request<ProjectDto[]>("/api/v1/projects")
      .then(setProjects)
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [me, setError]);
  async function create() {
    if (!me) return;
    setBusy(true);
    try {
      const project = await request<ProjectDto>(
        "/api/v1/projects",
        { method: "POST", body: JSON.stringify({ name, description }) },
        me.csrf,
      );
      location.assign(`/studio/projects/${project.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <WorkspaceShell me={me} error={error}>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="eyebrow mb-3 text-muted">
            YOUR NEXT COLLECTION STARTS HERE
          </p>
          <h1 className="text-3xl tracking-tight sm:text-4xl">
            나의 프로젝트{" "}
            <span className="ml-2 text-lg text-muted">
              {projects.length.toString().padStart(2, "0")}
            </span>
          </h1>
          <p className="mt-4 text-sm leading-7 text-muted">
            한 벌의 옷, 하나의 콘셉트. 새로운 촬영을 위한 공간입니다.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus size={16} aria-hidden="true" />새 프로젝트
        </Button>
      </div>
      <div className="mt-9 flex items-center justify-between border-b border-line pb-4 text-xs">
        <span className="flex items-center gap-2 font-semibold">
          <FolderOpen size={15} aria-hidden="true" />
          전체 프로젝트
        </span>
        <span className="text-muted">최근 수정 순</span>
      </div>
      {loading ? (
        <p role="status" className="py-20 text-sm text-muted">
          프로젝트를 불러오고 있습니다…
        </p>
      ) : projects.length ? (
        <div className="mt-7 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <a
              key={project.id}
              href={`/studio/projects/${project.id}`}
              className="group rounded-panel border border-line bg-surface p-6 transition-colors hover:border-[#87916f]"
            >
              <div className="flex h-36 items-center justify-center rounded-xl bg-studio">
                <FolderOpen size={48} strokeWidth={0.8} aria-hidden="true" />
              </div>
              <div className="mt-5 flex items-start justify-between gap-3">
                <h2 className="text-lg">{project.name}</h2>
                <ArrowUpRight size={18} aria-hidden="true" />
              </div>
              <p className="mt-3 line-clamp-2 min-h-10 text-xs leading-6 text-muted">
                {project.description || "새로운 컬렉션의 장면을 준비하세요."}
              </p>
              <p className="mt-5 border-t border-line pt-4 text-[10px] text-muted">
                {project.status === "deleting"
                  ? "삭제 중 · 다시 열어 삭제를 완료해 주세요"
                  : `${new Date(project.updatedAt).toLocaleDateString("ko-KR")} 수정`}
              </p>
            </a>
          ))}
        </div>
      ) : (
        <section className="my-7 grid min-h-[390px] place-items-center rounded-panel border border-dashed border-[#c4c9b8] bg-surface/70 px-6 py-12 text-center">
          <div className="max-w-md">
            <div className="mx-auto mb-7 grid size-20 place-items-center rounded-2xl border border-line bg-paper">
              <FolderPlus size={32} strokeWidth={1} aria-hidden="true" />
            </div>
            <p className="eyebrow mb-3 text-muted">
              A BLANK CANVAS, A NEW PERSPECTIVE.
            </p>
            <h2 className="text-2xl leading-relaxed">
              첫 번째 컬렉션을 기다리고 있어요.
            </h2>
            <p className="mt-4 text-sm leading-7 text-muted">
              시즌과 콘셉트별로 프로젝트를 만들고 의류 사진을 등록해 보세요.
              분석과 생성은 비용 안내를 확인한 뒤 직접 시작합니다.
            </p>
            <Button
              variant="secondary"
              className="mt-7"
              onClick={() => setOpen(true)}
            >
              첫 프로젝트 만들기
              <Plus size={15} aria-hidden="true" />
            </Button>
          </div>
        </section>
      )}
      <section className="mt-8 grid gap-6 border-t border-line pt-7 sm:grid-cols-3">
        {[
          ["01", "상품 사진 준비", "정면 사진 한 장에서 시작합니다."],
          ["02", "분석과 촬영 기획", "상품을 이해하고 원하는 장면을 정합니다."],
          [
            "03",
            "생성과 직접 검수",
            "원본과 비교한 뒤 사용 여부를 선택합니다.",
          ],
        ].map(([n, title, body]) => (
          <div key={n} className="flex gap-4">
            <span className="font-editorial text-xl text-muted">{n}</span>
            <div>
              <h3 className="text-xs font-semibold">{title}</h3>
              <p className="mt-2 text-[11px] leading-6 text-muted">{body}</p>
            </div>
          </div>
        ))}
      </section>
      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title="새 프로젝트"
        description="다음 시즌, 룩북, 캠페인처럼 촬영 목적에 맞춰 이름을 정해 주세요."
      >
        <form
          className="mt-6 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <div>
            <label
              htmlFor="project-name"
              className="mb-2 block text-xs font-semibold"
            >
              프로젝트 이름
            </label>
            <input
              id="project-name"
              className="studio-input"
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 2027 Spring Collection"
            />
          </div>
          <div>
            <label
              htmlFor="project-description"
              className="mb-2 block text-xs font-semibold"
            >
              간단한 설명 <span className="font-normal text-muted">선택</span>
            </label>
            <textarea
              id="project-description"
              className="studio-input min-h-24 resize-y"
              maxLength={1000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="컬렉션의 무드와 목적을 메모해 주세요."
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-800">
              {error}
            </p>
          )}
          <Button
            type="submit"
            disabled={busy || !name.trim()}
            className="w-full"
          >
            {busy ? "만드는 중…" : "프로젝트 만들기"}
          </Button>
        </form>
      </Modal>
    </WorkspaceShell>
  );
}
