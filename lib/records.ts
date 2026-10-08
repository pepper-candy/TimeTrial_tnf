import { minPlausibleSplitMs, splitDistance } from "./course";
import { liveMarks, normalizeBib, runnerByBib, zipPairs } from "./race";
import { markPack, packIndex } from "./tap-list";
import type { EditLogEntry, EventState, Mark, Pair, Tap } from "./types";

/** Quicker than this fraction of the runner's recent pace. */
export const TOO_FAST_PACE = 0.65;
/** Slower than this multiple of the runner's recent pace. */
export const TOO_SLOW_PACE = 1.75;

export const RECORD_TAG_LABEL = {
  "no-tap": "No tap",
  "no-bib": "No bib",
  duplicate: "Duplicate",
  "too-fast": "Too fast",
  "too-slow": "Too slow",
  "unknown-bib": "Unknown bib",
  edited: "Edited",
} as const;

export type RecordTag = keyof typeof RECORD_TAG_LABEL;

export type RecordRow = Pair & {
  elapsedMs: number | null;
  splitMs: number | null;
  estimated: boolean;
  tapPack: number | null;
  bibPack: number | null;
};

/** One row per crossing index. The shorter side is an empty slot on the tail. */
export function recordRows(
  event: Pick<EventState, "startedAt" | "taps" | "marks"> & {
    idles?: EventState["idles"];
    groups?: EventState["groups"];
  },
): RecordRow[] {
  const pairs = zipPairs(event.taps, event.marks);
  const liveIds = liveMarks(event.marks).map((m) => m.id);
  const rows: RecordRow[] = [];
  let prevElapsed = 0;
  for (const pair of pairs) {
    const tap = pair.tap;
    const tapPack = tap ? packIndex(tap.t, event.idles) : null;
    const bibPack = pair.mark ? markPack(pair.index, liveIds, event.groups) : null;
    if (!tap) {
      rows.push({
        ...pair,
        elapsedMs: null,
        splitMs: null,
        estimated: false,
        tapPack,
        bibPack,
      });
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
      tapPack,
      bibPack,
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

/**
 * Short tags for one records row. Pace tags compare a lap with that bib's
 * recent laps. Duplicate is a repeat of the same bib inside a physically
 * impossible gap. Marker appends are not "Edited"; corrections are.
 */
export function recordRowTags(
  event: Pick<EventState, "runners" | "course" | "edits">,
  rows: RecordRow[],
): RecordTag[][] {
  const corrected = correctedIds(event.edits);
  const prev = new Map<string, { t: number; crossing: number }>();
  const recent = new Map<string, number[]>();
  return rows.map((row) => {
    const tags: RecordTag[] = [];
    if (!row.tap) tags.push("no-tap");
    if (!row.mark) tags.push("no-bib");
    else if (!runnerByBib(event.runners, row.mark.bib)) tags.push("unknown-bib");

    if (row.tap && row.mark) {
      const bib = normalizeBib(row.mark.bib);
      const before = prev.get(bib);
      const crossing = (before?.crossing ?? 0) + 1;
      if (before) {
        const gap = row.tap.t - before.t;
        const dist = splitDistance(event.course, crossing);
        const minMs = minPlausibleSplitMs(dist);
        if (gap < minMs) {
          tags.push("duplicate");
        } else if (dist > 0) {
          const pace = gap / dist;
          const sample = recent.get(bib) ?? [];
          if (sample.length > 0) {
            const avg = sample.reduce((sum, n) => sum + n, 0) / sample.length;
            if (pace < avg * TOO_FAST_PACE) tags.push("too-fast");
            else if (pace > avg * TOO_SLOW_PACE) tags.push("too-slow");
          }
          recent.set(bib, [...sample, pace].slice(-2));
        }
      }
      prev.set(bib, { t: row.tap.t, crossing });
    }

    const edited =
      Boolean(row.tap?.estimated) ||
      (row.tap != null && corrected.has(row.tap.id)) ||
      (row.mark != null && corrected.has(row.mark.id));
    if (edited) tags.push("edited");
    return tags;
  });
}

/** Tap and bib ids that were actually corrected. A marker's normal bib append is not one of these. */
export function correctedIds(edits: EditLogEntry[] | undefined): Set<string> {
  const ids = new Set<string>();
  for (const edit of edits ?? []) {
    if (edit.kind === "tap-delete" || edit.kind === "mark-delete" || edit.kind === "pair-delete") {
      continue;
    }
    if (edit.kind === "mark-insert" && edit.actor !== "admin") continue;
    if (edit.tapId) ids.add(edit.tapId);
    if (edit.markId) ids.add(edit.markId);
  }
  return ids;
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
