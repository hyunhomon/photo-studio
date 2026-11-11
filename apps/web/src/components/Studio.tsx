import { BrandMark } from "@photo-studio/ui";
import { useAccount } from "../lib/account";
import WorkspaceShell from "./WorkspaceShell";
import { ProjectComposer } from "./ProjectComposer";

export default function Studio() {
  const { me, error, state, retry } = useAccount();
  return (
    <WorkspaceShell
      me={me}
      error={error}
      accountState={state}
      onRetry={retry}
      section="스튜디오"
      welcome
    >
      {me && (
        <section className="mx-auto flex min-h-[calc(100dvh-10rem)] max-w-2xl flex-col items-center justify-center pb-16 sm:pb-24">
          <BrandMark className="mb-6 size-11 text-primary" />
          <h1 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
            어떤 장면을 만들까요?
          </h1>
          <p className="mt-4 text-center text-sm leading-7 text-muted">
            한 벌의 옷에서 시작하는 다음 컬렉션.
          </p>
          <div className="mt-9 w-full">
            <ProjectComposer me={me} />
          </div>
          <p className="mt-7 max-w-md text-center text-[11px] leading-6 text-muted">
            프로젝트를 만들고 의류 사진을 추가해 보세요.
            <br />
            분석과 생성은 비용을 확인하고 직접 시작합니다.
          </p>
        </section>
      )}
    </WorkspaceShell>
  );
}
