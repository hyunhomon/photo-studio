import { Modal } from "@photo-studio/ui";
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
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={productId ? "상품 사진 추가" : "새 상품 등록"}
      description=""
    >
      <div className="mt-5">
        <ProductUploadForm
          csrf={csrf}
          productId={productId}
          remaining={remaining}
          onDone={onDone}
        />
      </div>
    </Modal>
  );
}
