// Local image preparation only. No network, analytics, or inference calls.
export const maxSelectedPhotoBytes = 30 * 1024 * 1024;
const maxUploadBytes = 8 * 1024 * 1024; // Leave room for server PNG normalization.
const maxPixels = 4_000_000;
const maxSide = 2048;
export const photoAccept =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";
export function isPhotoCandidate(file: File) {
  return (
    [
      "image/jpeg",
      "image/jpg",
      "image/pjpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
      "image/heic-sequence",
      "image/heif-sequence",
    ].includes(file.type.toLowerCase()) ||
    ((!file.type || file.type === "application/octet-stream") &&
      /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name))
  );
}
function imageType(header: Uint8Array) {
  const text = (offset: number, length: number) =>
    String.fromCharCode(...header.subarray(offset, offset + length));
  if (header[0] === 0xff && header[1] === 0xd8) return "image/jpeg";
  if (header[0] === 137 && text(1, 7) === "PNG\r\n\u001a\n") return "image/png";
  if (text(0, 4) === "RIFF" && text(8, 4) === "WEBP") return "image/webp";
  if (text(4, 4) === "ftyp") {
    for (let i = 8; i + 4 <= header.length; i += 4) {
      if (i === 12) continue; // minor version, not a compatible brand
      if (["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(text(i, 4)))
        return "image/heic";
    }
  }
  return null;
}
function decodePhoto(blob: Blob, message: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(blob);
    const finish = (ok: boolean) => {
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      URL.revokeObjectURL(url);
      if (ok && image.naturalWidth && image.naturalHeight) resolve(image);
      else {
        image.src = "";
        reject(new Error(message));
      }
    };
    const timer = setTimeout(() => finish(false), 30000);
    image.onload = () => finish(true);
    image.onerror = () => finish(false);
    image.src = url;
  });
}
async function canvasBlob(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(
              new Error("사진 변환을 완료하지 못했어요. 다시 선택해 주세요."),
            ),
      type,
      0.94,
    );
  });
}
export async function prepareUploadPhoto(
  file: File,
  label = "사진",
): Promise<File> {
  if (!file.size || file.size > maxSelectedPhotoBytes)
    throw new Error(`${label}은 한 장당 30MB 이하로 선택해 주세요.`);
  const type = imageType(new Uint8Array(await file.slice(0, 64).arrayBuffer()));
  if (!type)
    throw new Error(
      `${label}을 읽을 수 없어요. JPEG·PNG·WebP·HEIC 사진을 다시 선택해 주세요.`,
    );
  const image = await decodePhoto(
    new Blob([file], { type }),
    type === "image/heic"
      ? `${label}의 HEIC 형식을 이 브라우저에서 읽지 못했어요. Safari에서 선택하거나 JPEG로 저장해 주세요.`
      : `${label}을 읽을 수 없어요. 다른 사진을 선택해 주세요.`,
  );
  const canvas = document.createElement("canvas");
  try {
    const width = image.naturalWidth,
      height = image.naturalHeight;
    if (width * height > 60_000_000)
      throw new Error(
        `${label}의 해상도가 너무 커요. 크기를 줄여 다시 선택해 주세요.`,
      );
    // The browser applies EXIF orientation during decode; bake those displayed
    // pixels once, without rotating twice or trusting the reported File.type.
    const ratio = Math.min(
      1,
      maxSide / Math.max(width, height),
      Math.sqrt(maxPixels / (width * height)),
    );
    let scale = ratio;
    for (let attempt = 0; attempt < 4; attempt++) {
      canvas.width = Math.max(1, Math.floor(width * scale));
      canvas.height = Math.max(1, Math.floor(height * scale));
      const context = canvas.getContext("2d");
      if (!context)
        throw new Error(
          "사진을 준비하지 못했어요. 페이지를 새로고침해 주세요.",
        );
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      // Preserve transparency for PNG/WebP. JPEG/HEIC become ordinary JPEG.
      const outputType =
        type === "image/png" || type === "image/webp"
          ? "image/png"
          : "image/jpeg";
      const blob = await canvasBlob(canvas, outputType);
      if (blob.type !== outputType)
        throw new Error(
          "사진 형식을 변환하지 못했어요. 다른 사진을 선택해 주세요.",
        );
      if (blob.size && blob.size <= maxUploadBytes)
        return new File(
          [blob],
          outputType === "image/png" ? "photo.png" : "photo.jpg",
          { type: outputType, lastModified: file.lastModified },
        );
      scale *= 0.75;
    }
    throw new Error(
      `${label}의 용량을 줄이지 못했어요. 더 작은 사진을 선택해 주세요.`,
    );
  } finally {
    canvas.width = 1;
    canvas.height = 1;
    image.src = "";
  }
}
