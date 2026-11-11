export function BrandMark({ className = "size-10" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 56 56"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M18 4H52L44 32H27L20 52H4L18 4ZM29 15L27 23H35L38 15H29Z"
        clipRule="evenodd"
      />
      <path d="M34 38H49L45 52H30L34 38Z" fill="currentColor" />
    </svg>
  );
}
export function BrandLockup({
  stacked = false,
  className = "",
}: {
  stacked?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-2.5 ${className}`}>
      <BrandMark className="size-10 shrink-0 text-primary" />
      <span className="brand-wordmark">
        <span className={stacked ? "block" : ""}>PHOTO</span>
        {!stacked && " "}
        <span className={stacked ? "block" : ""}>STUDIO</span>
      </span>
    </span>
  );
}
