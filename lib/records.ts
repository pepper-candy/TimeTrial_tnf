import { zipPairs } from "./race";
import type { EventState, Mark, Pair, Tap } from "./types";

export type RecordRow = Pair & {
  elapsedMs: number | null;
  splitMs: number | null;
  estimated: boolean;
};

/** One row per crossing index. The shorter side is an empty slot on the tail. */
export function recordRows(
  event: Pick<EventState, "startedAt" | "taps" | "marks">,
): RecordRow[] {
  const pairs = zipPairs(event.taps, event.marks);
  const rows: RecordRow[] = [];
  let prevElapsed = 0;
  for (const pair of pairs) {
    const tap = pair.tap;
    if (!tap) {
      rows.push({ ...pair, elapsedMs: null, splitMs: null, estimated: false });
      continue;
    }
    const elapsedMs =
      event.startedAt == null ? 0 : Math.max(0, tap.t - event.startedAt);
    const splitMs = pair.index === 0 ? elapsedMs : Math.max(0, elapsedMs - prevElapsed);
    prevElapsed = elapsedMs;
    rows.push({
      ...pair,
      elapsedMs,
      splitMs,
      estimated: Boolean(tap.estimated),
    });
  }
  return rows;
}

export function recordCounts(taps: Tap[], marks: Mark[]): {
  taps: number;
  bibs: number;
  differ: boolean;
} {
  let tapN = 0;
  for (const tap of taps) if (tap.deletedAt == null) tapN++;
  let bibN = 0;
  for (const mark of marks) if (mark.deletedAt == null) bibN++;
  return { taps: tapN, bibs: bibN, differ: tapN !== bibN };
}

/** Six digits MMSSCC → milliseconds. Seconds above 59 are rejected. */
export function stopwatchDigitsToMs(digits: string): number | null {
  if (!/^\d{6}$/.test(digits)) return null;
  const mm = Number(digits.slice(0, 2));
  const ss = Number(digits.slice(2, 4));
  const cc = Number(digits.slice(4, 6));
  if (ss > 59) return null;
  return mm * 60_000 + ss * 1000 + cc * 10;
}

/** Typed digits plus underscores, e.g. "12:3_.__". */
export function timePrompt(typed: string): string {
  const raw = typed.replace(/\D/g, "").slice(0, 6);
  const chars = (raw + "______").slice(0, 6).split("");
  return `${chars[0]}${chars[1]}:${chars[2]}${chars[3]}.${chars[4]}${chars[5]}`;
}

/**
 * One time-pad key. Six digits submit MMSSCC. A seconds field above 59
 * refuses that key. Backspace and clear never submit.
 */
export function applyTimeKey(
  typed: string,
  key: string,
): { typed: string; submitMs: number | null } {
  if (key === "clear") return { typed: "", submitMs: null };
  if (key === "back") return { typed: typed.slice(0, -1), submitMs: null };
  if (!/^\d$/.test(key)) return { typed, submitMs: null };
  const next = (typed.replace(/\D/g, "") + key).slice(0, 6);
  if (next.length >= 4 && Number(next.slice(2, 4)) > 59) {
    return { typed, submitMs: null };
  }
  if (next.length >= 6) {
    const submitMs = stopwatchDigitsToMs(next);
    if (submitMs == null) return { typed, submitMs: null };
    return { typed: "", submitMs };
  }
  return { typed: next, submitMs: null };
}
