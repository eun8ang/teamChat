import { inflateSync } from "node:zlib";
import type { ImageMimeType } from "@/lib/media";

// Bounded structural validation, not an image decoder. Never trust filenames.
// Dimensions are capped to avoid accepting tiny compressed decompression bombs.
function dimensions(width: number, height: number) {
  return width > 0 && height > 0 && width <= 8192 && height <= 8192 && width * height <= 16_777_216;
}
function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function png(bytes: Buffer) {
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return false;
  let offset = 8;
  let header = false;
  let width = 0;
  let height = 0;
  let bitsPerPixel = 0;
  let interlaced = false;
  let endedData = false;
  let palette = false;
  let needsPalette = false;
  const data: Buffer[] = [];
  while (offset + 12 <= bytes.length) {
    const size = bytes.readUInt32BE(offset);
    const end = offset + 12 + size;
    if (end > bytes.length) return false;
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const chunk = bytes.subarray(offset + 8, end - 4);
    if (crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) return false;
    if (!header && type !== "IHDR") return false;
    if (type === "IHDR") {
      if (header || size !== 13 || !dimensions(chunk.readUInt32BE(0), chunk.readUInt32BE(4))) return false;
      const depths: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      if (!depths[chunk[9]]?.includes(chunk[8]) || chunk[10] !== 0 || chunk[11] !== 0 || chunk[12] > 1) return false;
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      bitsPerPixel = chunk[8] * ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[chunk[9]] ?? 0);
      interlaced = chunk[12] === 1;
      needsPalette = chunk[9] === 3;
      header = true;
    } else if (type === "IDAT") {
      if (endedData || (needsPalette && !palette)) return false;
      data.push(chunk);
    } else if (type === "PLTE") {
      if (palette || data.length || size === 0 || size > 768 || size % 3 !== 0) return false;
      palette = true;
    } else if (type === "IEND") {
      if (size !== 0 || end !== bytes.length || !data.length) return false;
      const decoded = inflateSync(Buffer.concat(data), { maxOutputLength: 128 * 1024 * 1024 });
      const passes = interlaced ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]];
      let position = 0;
      for (const [x, y, dx, dy] of passes) {
        const columns = Math.max(0, Math.ceil((width - x) / dx));
        const rows = Math.max(0, Math.ceil((height - y) / dy));
        if (!columns || !rows) continue;
        const rowBytes = Math.ceil(columns * bitsPerPixel / 8);
        for (let row = 0; row < rows; row++) {
          if (position >= decoded.length || decoded[position] > 4) return false;
          position += rowBytes + 1;
        }
      }
      return position === decoded.length;
    } else {
      if (data.length) endedData = true;
      if (type !== "PLTE" && type[0] === type[0].toUpperCase()) return false;
    }
    offset = end;
  }
  return false;
}
function jpeg(bytes: Buffer) {
  if (bytes.readUInt16BE(0) !== 0xffd8 || bytes.readUInt16BE(bytes.length - 2) !== 0xffd9) return false;
  let offset = 2;
  let frame = false;
  let scan = false;
  let entropy = false;
  while (offset < bytes.length) {
    if (scan && bytes[offset] !== 0xff) { entropy = true; offset++; continue; }
    if (bytes[offset++] !== 0xff) return false;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (scan && (marker === 0 || (marker >= 0xd0 && marker <= 0xd7))) continue;
    scan = false;
    if (marker === 0xd9) return frame && entropy && offset === bytes.length;
    if (offset + 2 > bytes.length) return false;
    const size = bytes.readUInt16BE(offset);
    if (size < 2 || offset + size > bytes.length) return false;
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (size < 11 || !dimensions(bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3))) return false;
      const channels = bytes[offset + 7];
      if (![1, 3, 4].includes(channels) || size !== 8 + 3 * channels || bytes[offset + 2] !== 8) return false;
      frame = true;
    }
    if (marker === 0xda) {
      if (!frame || size < 8 || size !== 6 + 2 * bytes[offset + 2]) return false;
      scan = true;
    }
    offset += size;
  }
  return false;
}
function webp(bytes: Buffer, frameOnly = false) {
  if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP" || bytes.readUInt32LE(4) + 8 !== bytes.length) return false;
  let offset = 12;
  let image = false;
  let animated = false;
  let animationHeader = false;
  let canvasWidth = 0;
  let canvasHeight = 0;
  while (offset + 8 <= bytes.length) {
    const type = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + size;
    if (end > bytes.length) return false;
    if (type === "VP8 ") {
      if (animated || image || size < 11 || (bytes[start] & 1) || !bytes.subarray(start + 3, start + 6).equals(Buffer.from([0x9d, 1, 0x2a]))) return false;
      if (!dimensions(bytes.readUInt16LE(start + 6) & 0x3fff, bytes.readUInt16LE(start + 8) & 0x3fff)) return false;
      const partitionLength = bytes.readUIntLE(start, 3) >>> 5;
      if (!partitionLength || partitionLength + 10 > size) return false;
      image = true;
    } else if (type === "VP8L") {
      if (animated || image || size < 6 || bytes[start] !== 0x2f || (bytes[start + 4] & 0xe0)) return false;
      const bits = bytes.readUInt32LE(start + 1);
      if (!dimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1)) return false;
      image = true;
    } else if (type === "VP8X") {
      if (frameOnly || offset !== 12 || size !== 10 || (bytes[start] & 0xc1) || bytes.readUIntLE(start + 1, 3) !== 0 || !dimensions(bytes.readUIntLE(start + 4, 3) + 1, bytes.readUIntLE(start + 7, 3) + 1)) return false;
      animated = Boolean(bytes[start] & 2);
      canvasWidth = bytes.readUIntLE(start + 4, 3) + 1;
      canvasHeight = bytes.readUIntLE(start + 7, 3) + 1;
    } else if (type === "ANIM") {
      if (!animated || animationHeader || image || size !== 6) return false;
      animationHeader = true;
    } else if (type === "ANMF") {
      if (!animated || !animationHeader || size <= 16 || (bytes[start + 15] & 0xfc)) return false;
      const x = bytes.readUIntLE(start, 3) * 2;
      const y = bytes.readUIntLE(start + 3, 3) * 2;
      const width = bytes.readUIntLE(start + 6, 3) + 1;
      const height = bytes.readUIntLE(start + 9, 3) + 1;
      if (!dimensions(width, height) || x + width > canvasWidth || y + height > canvasHeight) return false;
      // A frame contains a normal ALPH + VP8 or VP8L chunk sequence.
      // Wrap that bounded sequence for the same structural checks; nested
      // animation declarations are rejected when validating frame contents.
      const frameChunks = bytes.subarray(start + 16, end);
      const frame = Buffer.alloc(12 + frameChunks.length);
      frame.write("RIFF", 0); frame.writeUInt32LE(frame.length - 8, 4); frame.write("WEBP", 8);
      frameChunks.copy(frame, 12);
      if (!webp(frame, true)) return false;
      image = true;
    } else if (!["ALPH", "ICCP", "EXIF", "XMP "].includes(type)) return false;
    offset = end + (size % 2);
  }
  return image && offset === bytes.length;
}
export function hasValidImageStructure(bytes: Buffer, mime: ImageMimeType): boolean {
  if (bytes.length < 12) return false;
  try {
    return mime === "image/png" ? png(bytes) : mime === "image/jpeg" ? jpeg(bytes) : webp(bytes);
  } catch { return false; }
}
