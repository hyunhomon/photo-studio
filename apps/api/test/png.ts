import { deflateSync } from "node:zlib";
export function syntheticPng(width = 64, height = 96) {
  const crc = (bytes: Uint8Array) => {
    let n = 0xffffffff;
    for (const b of bytes) {
      n ^= b;
      for (let bit = 0; bit < 8; bit++)
        n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0);
    }
    return (n ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Uint8Array) => {
    const b = new Uint8Array(data.length + 12),
      v = new DataView(b.buffer);
    v.setUint32(0, data.length);
    b.set(new TextEncoder().encode(type), 4);
    b.set(data, 8);
    v.setUint32(b.length - 4, crc(b.subarray(4, b.length - 4)));
    return b;
  };
  const header = new Uint8Array(13),
    view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8;
  header[9] = 6;
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * (width * 4 + 1) + 1 + x * 4;
      const shirt =
        x > width * 0.25 &&
        x < width * 0.75 &&
        y > height * 0.2 &&
        y < height * 0.8;
      raw.set(shirt ? [230, 220, 200, 255] : [248, 247, 240, 255], i);
    }
  const pieces = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array()),
  ];
  const output = new Uint8Array(pieces.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of pieces) {
    output.set(p, offset);
    offset += p.length;
  }
  return output;
}
