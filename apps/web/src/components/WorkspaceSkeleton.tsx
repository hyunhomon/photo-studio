export default function WorkspaceSkeleton({
  label = "스튜디오를 불러오고 있습니다",
}: {
  label?: string;
}) {
  return (
    <section
      role="status"
      aria-label={label}
      aria-busy="true"
      className="mx-auto w-full max-w-4xl py-8"
    >
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="space-y-7 motion-safe:animate-pulse">
        <div className="h-3 w-24 rounded bg-studio" />
        <div className="h-8 w-2/3 max-w-sm rounded-lg bg-studio" />
        <div className="h-3 w-1/2 rounded bg-studio" />
        <div className="grid gap-5 pt-6 sm:grid-cols-[1fr_2fr]">
          <div className="h-64 rounded-2xl border border-line bg-surface/50" />
          <div className="space-y-5 rounded-2xl border border-line p-6">
            <div className="h-4 w-2/3 rounded bg-studio" />
            <div className="h-11 rounded-lg bg-studio" />
            <div className="h-11 rounded-lg bg-studio" />
            <div className="h-11 w-1/3 rounded-lg bg-studio" />
          </div>
        </div>
      </div>
    </section>
  );
}
