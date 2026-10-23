/**
 * Sprint start clock — server authority for `startedAt`.
 *
 * The Starter phone stamps the mic onset in server-ms domain
 * (`Date.now() + offset` from `useEvent`) and POSTs it. The server trusts that
 * stamp inside a clamp window instead of using its own receive time, so a slow
 * 4G POST cannot push the race clock late (which would shorten every finish).
 *
 * Receive time is the fallback only — never `recv − halfRtt`, which would make
 * variance worse.
 */

/** How far in the past a client bang stamp may be — absorbs slow POST/DELETE. */
export const MAX_SKEW_MS = 3000;

/** How far in the future a client stamp may be — absorbs offset estimate error. */
export const SMALL_FUTURE_MS = 250;

/**
 * Clamp a client-supplied bang stamp into `[recv − MAX_SKEW_MS, recv + SMALL_FUTURE_MS]`.
 * Missing / non-finite / non-number input falls back to `recv` (old behaviour,
 * e.g. the Time Trial Timer which posts no body at all).
 */
export function clampClientStartedAt(client: unknown, recv: number): number {
  if (typeof client !== "number" || !Number.isFinite(client)) return recv;
  const stamp = Math.round(client);
  return Math.min(recv + SMALL_FUTURE_MS, Math.max(recv - MAX_SKEW_MS, stamp));
}
