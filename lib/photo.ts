export const THUMB_SIZE = 320;
export const THUMB_TARGET_BYTES = 40 * 1024;
export const THUMB_MAX_BYTES = 80 * 1024;
export const FULL_MAX_BYTES = 1024 * 1024;
export const FULL_EDGE = 2560;

/** @deprecated use THUMB_*; kept so older imports still typecheck during the swap */
export const PHOTO_SIZE = THUMB_SIZE;
export const PHOTO_MAX_BYTES = THUMB_MAX_BYTES;
export const PHOTO_TARGET_BYTES = THUMB_TARGET_BYTES;

export type PhotoKind = "thumb" | "full";

const KEEP_FULL_MIME = new Set(["image/jpeg", "image/jpg", "image/webp", "image/png"]);

/** Square crop with a slight upward bias so faces stay in frame. */
export function faceCropRect(width: number, height: number) {
  const side = Math.min(width, height);
  const sx = Math.round((width - side) / 2);
  const sy = Math.round(Math.max(0, Math.min(height - side, (height - side) * 0.38)));
  return { sx, sy, side };
}

/** Scale so the longest side is at most `edge`, never upscale. */
export function fitLongestSide(width: number, height: number, edge = FULL_EDGE) {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const long = Math.max(w, h);
  if (long <= edge) return { width: w, height: h };
  const s = edge / long;
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) };
}

export function keepOriginalFull(bytes: number, mime: string): boolean {
  const type = mime.toLowerCase();
  return bytes > 0 && bytes <= FULL_MAX_BYTES && KEEP_FULL_MIME.has(type);
}

export function photoPath(
  eventId: string,
  runnerId: string,
  v: string,
  kind: PhotoKind = "thumb",
) {
  const s = kind === "full" ? "&s=full" : "";
  return `/api/photo/${encodeURIComponent(eventId)}/${encodeURIComponent(runnerId)}?v=${encodeURIComponent(v)}${s}`;
}

export function photoKey(eventId: string, runnerId: string, kind: PhotoKind = "thumb") {
  return `tt:photo:${eventId}:${runnerId}:${kind}`;
}

export function photoKeyLegacy(eventId: string, runnerId: string) {
  return `tt:photo:${eventId}:${runnerId}`;
}

export function allPhotoKeys(eventId: string, runnerId: string): string[] {
  return [
    photoKey(eventId, runnerId, "thumb"),
    photoKey(eventId, runnerId, "full"),
    photoKeyLegacy(eventId, runnerId),
  ];
}
