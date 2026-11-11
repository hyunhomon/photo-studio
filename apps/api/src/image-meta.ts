import { AppError } from "./errors";
export const maxImageBytes = 10 * 1024 * 1024;
export function inspectImage(bytes: Uint8Array, declared = "") {
  const invalid = () =>
    new AppError(
      "INVALID_IMAGE",
      "정상적인 JPEG, PNG, WebP 사진을 선택해 주세요.",
    );
  if (!bytes.length || bytes.length > maxImageBytes)
    throw new AppError(
      "IMAGE_TOO_LARGE",
      "사진 한 장은 10MB 이하여야 합니다.",
      413,
    );
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (offset: number, size: number) =>
    String.fromCharCode(...bytes.subarray(offset, offset + size));
  let mime = "",
    width = 0,
    height = 0;
  if (
    bytes.length >= 33 &&
    bytes[0] === 137 &&
    text(1, 7) === "PNG\r\n\u001a\n" &&
    text(12, 4) === "IHDR"
  ) {
    mime = "image/png";
    width = view.getUint32(16);
    height = view.getUint32(20);
  } else if (
    bytes.length >= 30 &&
    text(0, 4) === "RIFF" &&
    text(8, 4) === "WEBP" &&
    view.getUint32(4, true) + 8 === bytes.length
  ) {
    mime = "image/webp";
    if (text(12, 4) === "VP8X") {
      width = 1 + (view.getUint32(24, true) & 0xffffff);
      height =
        1 +
        ((bytes[27] ?? 0) | ((bytes[28] ?? 0) << 8) | ((bytes[29] ?? 0) << 16));
    } else if (text(12, 4) === "VP8L" && bytes[20] === 0x2f) {
      const bits = view.getUint32(21, true);
      width = 1 + (bits & 0x3fff);
      height = 1 + ((bits >>> 14) & 0x3fff);
    } else if (
      text(12, 4) === "VP8 " &&
      bytes[23] === 0x9d &&
      bytes[24] === 1 &&
      bytes[25] === 0x2a
    ) {
      width = view.getUint16(26, true) & 0x3fff;
      height = view.getUint16(28, true) & 0x3fff;
    }
  } else if (
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes.at(-2) === 0xff &&
    bytes.at(-1) === 0xd9
  ) {
    mime = "image/jpeg";
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) throw invalid();
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++] ?? 0;
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) throw invalid();
      if (
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker)
      ) {
        height = view.getUint16(offset + 3);
        width = view.getUint16(offset + 5);
        break;
      }
      offset += length;
    }
  }
  if (!mime || !width || !height || (declared && declared !== mime))
    throw invalid();
  if (width > 4096 || height > 4096 || width * height > 4_000_000)
    throw new AppError(
      "IMAGE_TOO_LARGE",
      "사진은 400만 픽셀 이하, 긴 변 4096px 이하로 줄여 주세요.",
      413,
    );
  return { mime, width, height };
}
