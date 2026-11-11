import {
  Description,
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
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
        <DialogPanel className="relative w-full max-w-lg rounded-panel border border-line bg-paper p-7 shadow-xl sm:p-10">
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
