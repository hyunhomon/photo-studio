import { useState } from "react";
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { X } from "lucide-react";
export default function ImageViewer({
  src,
  onClose,
}: {
  src: string | null;
  onClose: () => void;
}) {
  const [native, setNative] = useState(false);
  return (
    <Dialog
      open={Boolean(src)}
      onClose={onClose}
      className="fixed inset-0 z-[80]"
    >
      <DialogBackdrop className="fixed inset-0 bg-paper" />
      <div className="fixed inset-0 grid place-items-center p-2 sm:p-4">
        <DialogPanel className="image-viewer relative h-full w-full overflow-hidden bg-paper">
          <DialogTitle className="sr-only">사진 확대</DialogTitle>
          <button
            type="button"
            onClick={onClose}
            aria-label="확대 사진 닫기"
            className="absolute top-2 right-2 z-10 grid size-11 place-items-center rounded-full bg-surface"
          >
            <X size={22} />
          </button>
          {src && (
            <button
              type="button"
              aria-label={native ? "화면에 맞추기" : "원본 크기로 보기"}
              onClick={() => setNative((v) => !v)}
              className={`image-viewer-canvas ${native ? "native" : ""}`}
            >
              <img src={src} alt="확대 사진" />
            </button>
          )}
        </DialogPanel>
      </div>
    </Dialog>
  );
}
