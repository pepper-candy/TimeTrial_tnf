import { PHOTO_MAX_BYTES, PHOTO_SIZE, PHOTO_TARGET_BYTES, faceCropRect } from "@/lib/photo";

const QUALITIES = [0.82, 0.74, 0.66, 0.58, 0.5, 0.42];

export async function compressImage(file: File): Promise<{ blob: Blob; mime: string }> {
  const bitmap = await createImageBitmap(file);
  const { sx, sy, side } = faceCropRect(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = PHOTO_SIZE;
  canvas.height = PHOTO_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);

  const mimes = ["image/webp", "image/jpeg"] as const;
  let best: { blob: Blob; mime: string } | null = null;
  for (const mime of mimes) {
    for (const q of QUALITIES) {
      const blob = await toBlob(canvas, mime, q);
      if (!blob || blob.size === 0) continue;
      if (!best || blob.size < best.blob.size) best = { blob, mime };
      if (blob.size <= PHOTO_TARGET_BYTES) return { blob, mime };
    }
  }
  if (best && best.blob.size <= PHOTO_MAX_BYTES) return best;
  throw new Error("too-large");
}

function toBlob(canvas: HTMLCanvasElement, mime: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality));
}
