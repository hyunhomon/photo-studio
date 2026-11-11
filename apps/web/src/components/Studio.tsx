import { navigate } from "astro:transitions/client";
import { useAccount } from "../lib/account";
import WorkspaceShell from "./WorkspaceShell";
import ProductUploadForm from "./ProductUploadForm";
export default function Studio() {
  const { me, error, state, retry } = useAccount();
  return (
    <WorkspaceShell
      me={me}
      error={error}
      accountState={state}
      onRetry={retry}
      section="새 촬영"
      welcome
    >
      {me && (
        <section className="mx-auto flex min-h-dvh max-w-4xl flex-col justify-center py-24 text-center lg:py-16">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-4xl">
            어떤 옷을 촬영할까요?
          </h1>
          <p className="mt-4 mb-10 text-sm leading-7 text-muted">
            사진을 올리고, 원하는 장면을 함께 만들어 보세요.
          </p>
          <ProductUploadForm
            csrf={me.csrf}
            onDone={(p) => {
              void navigate(`/studio/products/${p.id}`);
            }}
          />
        </section>
      )}
    </WorkspaceShell>
  );
}
