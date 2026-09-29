export const STORAGE_CAP_BYTES = 256 * 1024 * 1024;
export const STORAGE_KEY = "tt:bytes";

export function applyStorageDelta(used: number, delta: number): number {
  const base = Number.isFinite(used) && used > 0 ? used : 0;
  const d = Number.isFinite(delta) ? delta : 0;
  return Math.max(0, Math.round(base + d));
}

export function formatStorage(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function storageRatio(used: number, cap = STORAGE_CAP_BYTES): number {
  if (cap <= 0) return 0;
  return Math.max(0, Math.min(1, used / cap));
}
