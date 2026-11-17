import decodePng, { init as initPng } from "@jsquash/png/decode.js";
import encodePng, { init as initPngEncode } from "@jsquash/png/encode.js";
import decodeJpeg, { init as initJpeg } from "@jsquash/jpeg/decode.js";
import encodeJpeg, { init as initJpegEncode } from "@jsquash/jpeg/encode.js";
import decodeWebp, { init as initWebp } from "@jsquash/webp/decode.js";
// @ts-expect-error wasm-bindgen declares named exports; Wrangler imports a precompiled module.
import PNG from "@jsquash/png/codec/pkg/squoosh_png_bg.wasm";
import JPEG from "@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm";
import JPEG_ENCODE from "@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm";
import WEBP from "@jsquash/webp/codec/dec/webp_dec.wasm";
import { inspectImage, maxImageBytes } from "./image-meta";
import { AppError } from "./errors";

async function wasm(value: WebAssembly.Module) {
  if (value instanceof WebAssembly.Module) return value;
  if (typeof Bun !== "undefined" && typeof value === "string")
    return WebAssembly.compile(await Bun.file(value).arrayBuffer());
  throw new Error("Image codec unavailable");
}
let pngReady: Promise<unknown> | undefined,
  jpegEncodeReady: Promise<unknown> | undefined,
  jpegReady: Promise<unknown> | undefined,
  webpReady: Promise<unknown> | undefined;
async function decode(input: Uint8Array, declared: string, generated = false) {
  const meta = inspectImage(
    input,
    declared,
    generated ? "generated" : "upload",
  );
  try {
    const buffer = new Uint8Array(input).buffer;
    let decoded: ImageData;
    if (meta.mime === "image/png") {
      pngReady ??= wasm(PNG).then(async (module) => {
        await initPng(module);
        await initPngEncode(module);
      });
      await pngReady;
      decoded = await decodePng(buffer);
    } else if (meta.mime === "image/jpeg") {
      jpegReady ??= wasm(JPEG).then((module) => initJpeg(module));
      await jpegReady;
      decoded = await decodeJpeg(buffer, { preserveOrientation: false });
    } else {
      webpReady ??= wasm(WEBP).then((module) => initWebp(module));
      await webpReady;
      decoded = await decodeWebp(buffer);
    }
    if (
      !decoded.width ||
      !decoded.height ||
      decoded.width * decoded.height !== meta.width * meta.height
    )
      throw new Error("Invalid decoded dimensions");
    return { decoded, meta };
  } catch {
    throw new AppError(
      "INVALID_IMAGE",
      "사진을 읽을 수 없습니다. 원본 사진을 다시 저장한 뒤 업로드해 주세요.",
    );
  }
}
function downscale(decoded: ImageData, maxDimension?: number) {
  if (!maxDimension || Math.max(decoded.width, decoded.height) <= maxDimension)
    return decoded;
  const ratio = maxDimension / Math.max(decoded.width, decoded.height);
  const width = Math.max(1, Math.round(decoded.width * ratio));
  const height = Math.max(1, Math.round(decoded.height * ratio));
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sy = Math.max(0, (y + 0.5) / ratio - 0.5);
    const y0 = Math.min(decoded.height - 1, Math.floor(sy)),
      y1 = Math.min(decoded.height - 1, y0 + 1),
      fy = sy - y0;
    for (let x = 0; x < width; x++) {
      const sx = Math.max(0, (x + 0.5) / ratio - 0.5);
      const x0 = Math.min(decoded.width - 1, Math.floor(sx)),
        x1 = Math.min(decoded.width - 1, x0 + 1),
        fx = sx - x0;
      for (let c = 0; c < 4; c++) {
        const a = decoded.data[(y0 * decoded.width + x0) * 4 + c] ?? 0;
        const b = decoded.data[(y0 * decoded.width + x1) * 4 + c] ?? 0;
        const d = decoded.data[(y1 * decoded.width + x0) * 4 + c] ?? 0;
        const e = decoded.data[(y1 * decoded.width + x1) * 4 + c] ?? 0;
        data[(y * width + x) * 4 + c] =
          (a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy;
      }
    }
  }
  return { width, height, data, colorSpace: "srgb" } as ImageData;
}
/** Full decode validation; retain the provider's native bytes and pixel dimensions. */
export async function preserveGeneratedImage(
  input: Uint8Array,
  declared: string,
) {
  const { meta } = await decode(input, declared, true);
  return {
    bytes: input,
    width: meta.width,
    height: meta.height,
    mimeType: meta.mime,
  };
}
/** Private display derivatives only; no intermediate full-size PNG re-encode. */
export async function previewImage(
  input: Uint8Array,
  declared: string,
  size: number,
  generated = false,
) {
  const { decoded } = await decode(input, declared, generated);
  const pixels = downscale(decoded, size);
  let transparent = false;
  for (let i = 3; i < pixels.data.length; i += 4)
    if (pixels.data[i] !== 255) {
      transparent = true;
      break;
    }
  let bytes: Uint8Array<ArrayBuffer>;
  if (transparent) {
    pngReady ??= wasm(PNG).then(async (module) => {
      await initPng(module);
      await initPngEncode(module);
    });
    await pngReady;
    bytes = new Uint8Array(await encodePng(pixels));
  } else {
    jpegEncodeReady ??= wasm(JPEG_ENCODE).then((module) =>
      initJpegEncode(module),
    );
    await jpegEncodeReady;
    bytes = new Uint8Array(await encodeJpeg(pixels, { quality: 88 }));
  }
  return {
    bytes,
    width: pixels.width,
    height: pixels.height,
    mimeType: transparent ? "image/png" : "image/jpeg",
  };
}
export async function normalizeImage(
  input: Uint8Array,
  declared = "",
  maxDimension?: number,
) {
  const { decoded } = await decode(input, declared);
  const pixels = downscale(decoded, maxDimension);
  pngReady ??= wasm(PNG).then(async (module) => {
    await initPng(module);
    await initPngEncode(module);
  });
  await pngReady;
  const bytes = new Uint8Array(await encodePng(pixels));
  if (bytes.length > maxImageBytes)
    throw new AppError(
      "IMAGE_TOO_LARGE",
      "사진의 크기를 조금 줄인 뒤 다시 업로드해 주세요.",
      413,
    );
  return {
    bytes,
    width: pixels.width,
    height: pixels.height,
    mimeType: "image/png",
  };
}
