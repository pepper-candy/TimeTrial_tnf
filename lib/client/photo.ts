import {
  FULL_EDGE,
  FULL_MAX_BYTES,
  THUMB_MAX_BYTES,
  THUMB_SIZE,
  THUMB_TARGET_BYTES,
  faceCropRect,
  fitLongestSide,
  keepOriginalFull,
} from "@/lib/photo";

const THUMB_QUALITIES = [0.82, 0.74, 0.66, 0.58, 0.5, 0.42];
const FULL_QUALITIES = [0.92, 0.86, 0.78, 0.7, 0.6, 0.5, 0.4];
const MIMES = ["image/webp", "image/jpeg"] as const;

export type PreparedPhoto = { blob: Blob; mime: string };

export async function preparePhotos(file: File): Promise<{
  thumb: PreparedPhoto;
  full: PreparedPhoto;
}> {
  const bitmap = await createImageBitmap(file);
  try {
    const thumb = await encodeThumb(bitmap);
    const full = keepOriginalFull(file.size, file.type)
      ? { blob: file, mime: normalizeMime(file.type) }
      : await encodeFull(bitmap);
    return { thumb, full };
  } finally {
    bitmap.close?.();
  }
}

/** @deprecated use preparePhotos — still encodes a live-UI thumb. */
export async function compressImage(file: File): Promise<PreparedPhoto> {
  const { thumb } = await preparePhotos(file);
  return thumb;
}

async function encodeThumb(bitmap: ImageBitmap): Promise<PreparedPhoto> {
  const { sx, sy, side } = faceCropRect(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = THUMB_SIZE;
  canvas.height = THUMB_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, THUMB_SIZE, THUMB_SIZE);
  return encodeStepped(canvas, THUMB_QUALITIES, THUMB_TARGET_BYTES, THUMB_MAX_BYTES);
}

async function encodeFull(bitmap: ImageBitmap): Promise<PreparedPhoto> {
  const { width, height } = fitLongestSide(bitmap.width, bitmap.height, FULL_EDGE);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  return encodeStepped(canvas, FULL_QUALITIES, FULL_MAX_BYTES, FULL_MAX_BYTES);
}

async function encodeStepped(
  canvas: HTMLCanvasElement,
  qualities: number[],
  target: number,
  max: number,
): Promise<PreparedPhoto> {
  let best: PreparedPhoto | null = null;
  for (const mime of MIMES) {
    for (const q of qualities) {
      const blob = await toBlob(canvas, mime, q);
      if (!blob || blob.size === 0) continue;
      if (!best || blob.size < best.blob.size) best = { blob, mime };
      if (blob.size <= target) return { blob, mime };
    }
  }
  if (best && best.blob.size <= max) return best;
  throw new Error("too-large");
}

function normalizeMime(mime: string): string {
  const t = mime.toLowerCase();
  if (t === "image/jpg" || t === "image/jpeg") return "image/jpeg";
  if (t === "image/webp") return "image/webp";
  if (t === "image/png") return "image/png";
  return "image/jpeg";
}

function toBlob(canvas: HTMLCanvasElement, mime: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality));
}
