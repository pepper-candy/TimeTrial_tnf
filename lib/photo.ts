export const PHOTO_SIZE = 320;
export const PHOTO_MAX_BYTES = 80 * 1024;
export const PHOTO_TARGET_BYTES = 40 * 1024;

/** Square crop with a slight upward bias so faces stay in frame. */
export function faceCropRect(width: number, height: number) {
  const side = Math.min(width, height);
  const sx = Math.round((width - side) / 2);
  const sy = Math.round(Math.max(0, Math.min(height - side, (height - side) * 0.38)));
  return { sx, sy, side };
}

export function photoPath(eventId: string, runnerId: string, v: string) {
  return `/api/photo/${encodeURIComponent(eventId)}/${encodeURIComponent(runnerId)}?v=${encodeURIComponent(v)}`;
}

export function photoKey(eventId: string, runnerId: string) {
  return `tt:photo:${eventId}:${runnerId}`;
}
