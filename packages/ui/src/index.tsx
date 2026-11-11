import {
  Description,
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import { X, ChevronDown } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
export { BrandLockup, BrandMark } from "./brand";

export function Button({
  className = "",
  variant = "primary",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
}) {
  const variants = {
    primary:
      "border border-primary bg-primary text-on-primary hover:border-primary-hover hover:bg-primary-hover",
    secondary:
      "border border-control bg-surface text-ink hover:border-muted hover:bg-elevated",
  };
  return (
    <button
      type={type}
      className={`studio-button inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

export function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <Listbox value={value} onChange={onChange}>
        <ListboxButton
          aria-label={label}
          className="studio-input group flex items-center justify-between gap-3 text-left"
        >
          <span className="min-w-0 truncate">
            {options.find((option) => option.value === value)?.label ?? label}
          </span>
          <ChevronDown
            size={16}
            strokeWidth={1.75}
            aria-hidden="true"
            className="shrink-0 text-muted transition-transform group-data-open:rotate-180"
          />
        </ListboxButton>
        <ListboxOptions
          anchor="bottom start"
          className="z-[60] mt-2 w-[var(--button-width)] rounded-xl border border-line bg-surface p-1 shadow-lg outline-none"
        >
          {options.map((option) => (
            <ListboxOption
              key={option.value}
              value={option.value}
              className="cursor-pointer rounded-lg px-4 py-3 text-sm data-focus:bg-accent-soft data-focus:text-primary data-selected:font-semibold data-selected:text-primary"
            >
              {option.label}
            </ListboxOption>
          ))}
        </ListboxOptions>
      </Listbox>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onClose={onClose} className="fixed inset-0 z-50">
      <DialogBackdrop className="fixed inset-0 bg-overlay/80 backdrop-blur-sm" />
      <div className="fixed inset-0 flex items-center justify-center overflow-y-auto p-5">
        <DialogPanel className="relative max-h-[calc(100dvh-2.5rem)] w-full max-w-lg overflow-y-auto rounded-panel border border-line bg-surface p-7 shadow-2xl sm:p-10">
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="absolute top-4 right-4 rounded-full p-2 hover:bg-studio"
          >
            <X size={20} aria-hidden="true" />
          </button>

          <DialogTitle className="pr-5 text-2xl font-semibold tracking-tight">
            {title}
          </DialogTitle>
          {description && (
            <Description className="mt-4 text-sm leading-7 text-muted">
              {description}
            </Description>
          )}
          {children}
        </DialogPanel>
      </div>
    </Dialog>
  );
}
