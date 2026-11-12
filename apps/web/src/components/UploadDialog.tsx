import { Modal } from "@photo-studio/ui";
import { useState } from "react";
import type { ProductDto } from "@photo-studio/schemas";
import ProductUploadForm from "./ProductUploadForm";
export default function UploadDialog({
  open,
  onClose,
  productId,
  csrf,
  onDone,
  remaining = 3,
}: {
  open: boolean;
  onClose: () => void;
  productId?: string;
  csrf: string;
  onDone: (p: ProductDto) => void;
  remaining?: number;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={productId ? "상품 사진 추가" : "새 상품 등록"}
      description={
        productId ? "추가한 사진은 상품 재분석·기획 실행 시 반영됩니다." : ""
      }
    >
      <div className="mt-5">
        <ProductUploadForm
          csrf={csrf}
          productId={productId}
          remaining={remaining}
          onDone={onDone}
          onBusy={setBusy}
        />
      </div>
    </Modal>
  );
}
