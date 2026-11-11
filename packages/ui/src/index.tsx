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
import { X } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({
  className = "",
  variant = "primary",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
}) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variant === "primary" ? "bg-ink text-paper hover:bg-ink/85" : "border border-line bg-transparent text-ink hover:bg-studio"} ${className}`}
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
          className="studio-input flex items-center justify-between text-left"
        >
          {options.find((option) => option.value === value)?.label ?? label}
          <span aria-hidden="true">⌄</span>
        </ListboxButton>
        <ListboxOptions
          anchor="bottom start"
          className="z-[60] mt-2 w-[var(--button-width)] rounded-xl border border-line bg-surface p-1 shadow-lg outline-none"
        >
          {options.map((option) => (
            <ListboxOption
              key={option.value}
              value={option.value}
              className="cursor-pointer rounded-lg px-4 py-3 text-sm data-focus:bg-studio data-selected:font-semibold"
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
  description: string;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onClose={onClose} className="fixed inset-0 z-50">
      <DialogBackdrop className="fixed inset-0 bg-ink/45 backdrop-blur-sm" />
      <div className="fixed inset-0 flex items-center justify-center overflow-y-auto p-5">
        <DialogPanel className="relative max-h-[calc(100dvh-2.5rem)] w-full max-w-lg overflow-y-auto rounded-panel border border-line bg-paper p-7 shadow-xl sm:p-10">
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="absolute top-4 right-4 rounded-full p-2 hover:bg-studio"
          >
            <X size={20} aria-hidden="true" />
          </button>
          <p className="eyebrow mb-5">PHOTO STUDIO / EARLY ACCESS</p>
          <DialogTitle className="pr-5 text-2xl font-semibold tracking-tight">
            {title}
          </DialogTitle>
          <Description className="mt-4 text-sm leading-7 text-muted">
            {description}
          </Description>
          {children}
        </DialogPanel>
      </div>
    </Dialog>
  );
}
