import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Plus,
  Shirt,
  Trash2,
  Pencil,
} from "lucide-react";
import { Button, Modal } from "@photo-studio/ui";
import type { ProductDto, ProjectDto } from "@photo-studio/schemas";
import { useAccount } from "../lib/account";
import { apiBase, errorMessage, request } from "../lib/api";
import WorkspaceShell from "./WorkspaceShell";
import WorkspaceSkeleton from "./WorkspaceSkeleton";
import { navigate } from "astro:transitions/client";
import UploadDialog from "./UploadDialog";

type Project = ProjectDto & { products: ProductDto[] };
export default function ProjectScreen({ id }: { id: string }) {
  const { me, error, setError, state, retry } = useAccount();
  const [project, setProject] = useState<Project | null>(null);
  const [upload, setUpload] = useState(false),
    [remove, setRemove] = useState(false),
    [edit, setEdit] = useState(false),
    [busy, setBusy] = useState(false);
  const [name, setName] = useState(""),
    [description, setDescription] = useState("");
  useEffect(() => {
    if (!me) return;
    request<Project>(`/api/v1/projects/${id}`)
      .then((p) => {
        setProject(p);
        setName(p.name);
        setDescription(p.description);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [me, id, setError]);
  async function mutate(deleting: boolean) {
    if (!me) return;
    setBusy(true);
    try {
      const data = await request<ProjectDto>(
        `/api/v1/projects/${id}`,
        {
          method: deleting ? "DELETE" : "PATCH",
          ...(deleting ? {} : { body: JSON.stringify({ name, description }) }),
        },
        me.csrf,
      );
      if (deleting) await navigate("/studio");
      else {
        if (project) setProject({ ...project, ...data });
        setEdit(false);
      }
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
      activeProjectId={id}
      title={project?.name}
    >
      {!project ? (
        <WorkspaceSkeleton label="프로젝트를 불러오고 있습니다" />
      ) : (
        <>
          <a
            href="/studio"
            className="mb-6 flex items-center gap-2 text-xs text-muted"
          >
            <ArrowLeft size={14} aria-hidden="true" />새 작업 시작
          </a>
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="eyebrow text-muted">
                COLLECTION / {new Date(project.createdAt).getFullYear()}
              </p>
              <h1 className="mt-3 text-3xl leading-relaxed sm:text-4xl">
                {project.name}
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-7 text-muted">
                {project.description ||
                  "상품을 등록하고 컬렉션의 다음 장면을 계획하세요."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => setEdit(true)}
                aria-label="프로젝트 수정"
              >
                <Pencil size={15} aria-hidden="true" />
              </Button>
              <Button
                variant="secondary"
                onClick={() => setRemove(true)}
                aria-label="프로젝트 삭제"
              >
                <Trash2 size={15} aria-hidden="true" />
              </Button>
              <Button
                onClick={() => setUpload(true)}
                disabled={project.status === "deleting"}
              >
                <Plus size={16} aria-hidden="true" />
                상품 등록
              </Button>
            </div>
          </div>
          {project.status === "deleting" && (
            <div
              role="alert"
              className="mt-6 rounded-lg bg-warning-surface p-4 text-sm text-warning"
            >
              삭제 작업을 완료하지 못했습니다. 프로젝트 삭제를 다시 실행해
              주세요.
            </div>
          )}
          <div className="mt-8 flex items-center justify-between border-b border-line pb-4 text-xs">
            <span className="font-semibold">
              등록한 상품{" "}
              <span className="ml-1 text-muted">{project.products.length}</span>
            </span>
            <span className="text-muted">원본 사진은 비공개로 보관합니다</span>
          </div>
          {project.products.length ? (
            <div className="mt-7 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {project.products.map((product) => (
                <a
                  href={`/studio/products/${product.id}`}
                  key={product.id}
                  className="group overflow-hidden rounded-panel border border-line bg-surface transition-colors hover:border-primary/60"
                >
                  <div className="grid aspect-[4/3] place-items-center bg-studio p-4">
                    {product.assets.find((a) => a.kind === "input") ? (
                      <img
                        src={`${apiBase}/api/v1/assets/${product.assets.find((a) => a.kind === "input")?.id}/content`}
                        alt={product.name}
                        loading="lazy"
                        className="size-full object-contain"
                      />
                    ) : (
                      <Shirt size={48} strokeWidth={1} aria-hidden="true" />
                    )}
                  </div>
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-lg">{product.name}</h2>
                      <ArrowUpRight size={18} aria-hidden="true" />
                    </div>
                    <p className="mt-3 text-[11px] text-muted">
                      참조 사진{" "}
                      {product.assets.filter((a) => a.kind === "input").length}
                      장 · {product.analysis ? "분석 완료" : "분석 전"}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <div className="mt-7 grid min-h-80 place-items-center rounded-panel border border-dashed border-line bg-surface/50 p-8 text-center">
              <div>
                <Shirt
                  className="mx-auto"
                  size={36}
                  strokeWidth={1}
                  aria-hidden="true"
                />
                <h2 className="mt-5 text-xl">어떤 옷으로 시작할까요?</h2>
                <p className="mt-3 text-sm leading-7 text-muted">
                  의류 정면 사진 한 장으로 첫 상품을 등록하세요.
                  <br />
                  업로드는 AI를 실행하지 않습니다.
                </p>
                <Button
                  variant="secondary"
                  className="mt-6"
                  onClick={() => setUpload(true)}
                >
                  첫 상품 등록
                </Button>
              </div>
            </div>
          )}
          {me && (
            <UploadDialog
              open={upload}
              onClose={() => setUpload(false)}
              projectId={id}
              csrf={me.csrf}
              onDone={(p) => void navigate(`/studio/products/${p.id}`)}
            />
          )}
          <Modal
            open={remove}
            onClose={() => {
              if (!busy) setRemove(false);
            }}
            title="프로젝트를 삭제할까요?"
            description="이 프로젝트의 모든 상품, 원본·결과 사진, 촬영 계획과 작업 기록을 영구 삭제합니다. 삭제 후에는 복구할 수 없습니다."
          >
            <div className="mt-7 flex gap-3">
              <Button
                variant="secondary"
                onClick={() => setRemove(false)}
                disabled={busy}
              >
                취소
              </Button>
              <Button
                variant="danger"
                onClick={() => void mutate(true)}
                disabled={busy}
              >
                {busy ? "삭제 중…" : "영구 삭제"}
              </Button>
            </div>
          </Modal>
          <Modal
            open={edit}
            onClose={() => setEdit(false)}
            title="프로젝트 수정"
            description="촬영 목적에 맞게 프로젝트 정보를 바꿔 주세요."
          >
            <form
              className="mt-6 space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                void mutate(false);
              }}
            >
              <div>
                <label
                  htmlFor="edit-project-name"
                  className="mb-2 block text-xs font-semibold"
                >
                  프로젝트 이름
                </label>
                <input
                  id="edit-project-name"
                  className="studio-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={120}
                />
              </div>
              <div>
                <label
                  htmlFor="edit-project-description"
                  className="mb-2 block text-xs font-semibold"
                >
                  설명
                </label>
                <textarea
                  id="edit-project-description"
                  className="studio-input min-h-24"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={1000}
                />
              </div>
              <Button
                type="submit"
                disabled={busy || !name.trim()}
                className="w-full"
              >
                변경 저장
              </Button>
            </form>
          </Modal>
        </>
      )}
    </WorkspaceShell>
  );
}
