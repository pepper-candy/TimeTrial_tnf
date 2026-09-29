import { liveTaps } from "./race";
import type { EventState, Tap } from "./types";

export type TapRow = {
  id: string;
  /** 1-based chronological index. Newest row is first. */
  n: number;
  splitMs: number;
  elapsedMs: number;
  estimated: boolean;
};

/** Lap rows for the timer, newest first. Split is the gap since the previous tap. */
export function tapRows(event: Pick<EventState, "startedAt">, taps: Tap[]): TapRow[] {
  const live = liveTaps(taps);
  let prev = 0;
  const rows: TapRow[] = [];
  for (let i = 0; i < live.length; i++) {
    const elapsedMs =
      event.startedAt == null ? 0 : Math.max(0, live[i].t - event.startedAt);
    rows.push({
      id: live[i].id,
      n: i + 1,
      splitMs: i === 0 ? elapsedMs : Math.max(0, elapsedMs - prev),
      elapsedMs,
      estimated: Boolean(live[i].estimated),
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
