import { fetchWithPin } from "@/lib/client/hooks";
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

/** Convert a JPEG data URL (finish-frame still) into a File for the photo route. */
export function dataUrlToFile(dataUrl: string, name = "finish.jpg"): File | null {
  try {
    const m = /^data:([^;,]+)(;base64)?,([\s\S]*)$/.exec(dataUrl);
    if (!m) return null;
    const mime = m[1] || "image/jpeg";
    const body = m[3];
    const bin = m[2] ? atob(body) : decodeURIComponent(body);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], name, { type: mime });
  } catch {
    return null;
  }
}

/**
 * Upload a snapped finish-line still under a runner, mirroring the admin
 * person-photo capture (`preparePhotos` → multipart → `/api/events/[code]/photo`).
 * Still only — a video blob is never sent to server storage.
 */
export async function uploadFinishSnapshot(
  code: string,
  runnerId: string,
  dataUrl: string,
): Promise<void> {
  const file = dataUrlToFile(dataUrl);
  if (!file) return;
  const { thumb, full } = await preparePhotos(file);
  const form = new FormData();
  form.set(
    "thumb",
    new File([thumb.blob], thumb.mime === "image/webp" ? "t.webp" : "t.jpg", {
      type: thumb.mime,
    }),
  );
  form.set(
    "full",
    new File(
      [full.blob],
      full.mime === "image/webp" ? "f.webp" : full.mime === "image/png" ? "f.png" : "f.jpg",
      { type: full.mime },
    ),
  );
  form.set("runnerId", runnerId);
  const res = await fetchWithPin(`/api/events/${code}/photo`, { method: "POST", body: form });
  if (!res.ok) throw new Error(String(res.status));
}
