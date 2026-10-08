import { liveTaps } from "./race";
import type { EventState, Tap } from "./types";

export const IDLE_GAP_MS = 4000;

export type TapRow = {
  id: string;
  /** Wall clock of the tap. */
  t: number;
  /** 1-based chronological index. Newest row is first. */
  n: number;
  splitMs: number;
  elapsedMs: number;
  estimated: boolean;
  /** Pack index; increments after each Idle break. */
  pack: number;
};

/** Taps with t after an idle belong to the next pack. */
export function packIndex(tapT: number, idles: { t: number }[] | undefined): number {
  let g = 0;
  for (const idle of idles ?? []) {
    if (tapT > idle.t) g++;
  }
  return g;
}

/** Marks after a Group break's `afterId` belong to the next pack. */
export function markPack(
  i: number,
  liveIds: string[],
  groups: { afterId: string }[] | undefined,
): number {
  let g = 0;
  for (const br of groups ?? []) {
    const at = liveIds.indexOf(br.afterId);
    if (at >= 0 && i > at) g++;
  }
  return g;
}

/** Lap rows for the timer, newest first. Split is the gap since the previous tap. */
export function tapRows(
  event: Pick<EventState, "startedAt"> & { idles?: EventState["idles"] },
  taps: Tap[],
): TapRow[] {
  const live = liveTaps(taps);
  let prev = 0;
  const rows: TapRow[] = [];
  for (let i = 0; i < live.length; i++) {
    const elapsedMs =
      event.startedAt == null ? 0 : Math.max(0, live[i].t - event.startedAt);
    rows.push({
      id: live[i].id,
      t: live[i].t,
      n: i + 1,
      splitMs: i === 0 ? elapsedMs : Math.max(0, elapsedMs - prev),
      elapsedMs,
      estimated: Boolean(live[i].estimated),
      pack: packIndex(live[i].t, event.idles),
    });
    prev = elapsedMs;
  }
  rows.reverse();
  return rows;
}

/** Stopwatch time: 00:01.08, or +00:01.08 for a lap split. Centiseconds. */
export function formatStopwatch(ms: number, plus = false): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const cs = Math.floor(ms / 10) % 100;
  const totalSec = Math.floor(ms / 1000);
  const s = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const m = totalMin % 60;
  const h = Math.floor(totalMin / 60);
  const ss = String(s).padStart(2, "0");
  const ff = String(cs).padStart(2, "0");
  const body =
    h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${ss}.${ff}`
      : `${String(m).padStart(2, "0")}:${ss}.${ff}`;
  return plus ? `+${body}` : body;
}
