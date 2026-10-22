import { liveTaps } from "./race";
import type { EventState, SyncCut, Tap } from "./types";

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
  /** Blue sync line sits on the newest edge of this pre-cut row. */
  cutBefore: boolean;
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

/** After a sync padded to max(taps, bibs), the next tap/bib is numbered max+1. */
export function indexAfterSyncs(
  i: number,
  mine: "taps" | "marks",
  syncs: SyncCut[] | undefined,
): number {
  let startN = 1;
  let startI = 0;
  for (const s of syncs ?? []) {
    const cut = mine === "taps" ? s.taps : s.marks;
    if (i < cut) break;
    startI = cut;
    startN = Math.max(s.taps, s.marks) + 1;
  }
  return startN + (i - startI);
}

export function syncPadIds(syncs: SyncCut[] | undefined): { taps: Set<string>; marks: Set<string> } {
  const taps = new Set<string>();
  const marks = new Set<string>();
  for (const s of syncs ?? []) {
    for (const id of s.padTapIds ?? []) taps.add(id);
    for (const id of s.padMarkIds ?? []) marks.add(id);
  }
  return { taps, marks };
}

export function cutBeforeAt(i: number, mine: "taps" | "marks", syncs: SyncCut[] | undefined): boolean {
  return (syncs ?? []).some((s) => (mine === "taps" ? s.taps : s.marks) === i + 1);
}

export function sinceLastSync(
  taps: number,
  marks: number,
  syncs: SyncCut[] | undefined,
): { taps: number; marks: number } {
  const last = (syncs ?? [])[(syncs ?? []).length - 1];
  if (!last) return { taps, marks };
  return { taps: Math.max(0, taps - last.taps), marks: Math.max(0, marks - last.marks) };
}

/** Lap rows for the timer, newest first. Split is the gap since the previous tap. */
export function tapRows(
  event: Pick<EventState, "startedAt"> & { idles?: EventState["idles"]; syncs?: EventState["syncs"] },
  taps: Tap[],
): TapRow[] {
  const live = liveTaps(taps);
  const pads = syncPadIds(event.syncs).taps;
  let prev = 0;
  const rows: TapRow[] = [];
  for (let i = 0; i < live.length; i++) {
    if (pads.has(live[i].id)) continue;
    const elapsedMs =
      event.startedAt == null ? 0 : Math.max(0, live[i].t - event.startedAt);
    rows.push({
      id: live[i].id,
      t: live[i].t,
      n: indexAfterSyncs(i, "taps", event.syncs),
      splitMs: rows.length === 0 ? elapsedMs : Math.max(0, elapsedMs - prev),
      elapsedMs,
      estimated: Boolean(live[i].estimated),
      pack: packIndex(live[i].t, event.idles),
      cutBefore: isLastVisibleBeforeCut(i, live, pads, event.syncs, "taps"),
    });
    prev = elapsedMs;
  }
  rows.reverse();
  return rows;
}

export function isLastVisibleBeforeCut(
  i: number,
  live: { id: string }[],
  pads: Set<string>,
  syncs: SyncCut[] | undefined,
  mine: "taps" | "marks",
): boolean {
  return (syncs ?? []).some((s) => {
    const cut = mine === "taps" ? s.taps : s.marks;
    for (let j = Math.min(cut, live.length) - 1; j >= 0; j--) {
      if (!pads.has(live[j].id)) return j === i;
    }
    return false;
  });
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
