import { inCategory, type Category } from "./category";
import { crossingDistance, splitDistance } from "./course";
import { compareRank, splitEstimated, type RunnerRace } from "./race";
import { isImpossibleSplit } from "./stats";
import type { CourseConfig, EventState } from "./types";

export type BoardFilter = "all" | Category;

export type LapColumn = {
  /** 1-based crossing number (the "frame"). */
  n: number;
  distanceM: number;
  /** Whole km landing on this crossing, e.g. 1 for "1K". */
  km: number | null;
};

export function lapColumns(course: CourseConfig): LapColumn[] {
  return Array.from({ length: course.requiredCrossings }, (_, i) => {
    const distanceM = crossingDistance(course, i + 1);
    const k = distanceM / 1000;
    const km = k >= 1 && Math.abs(k - Math.round(k)) < 0.0005 ? Math.round(k) : null;
    return { n: i + 1, distanceM, km };
  });
}

export function isFullLap(course: CourseConfig, splitIndex0: number): boolean {
  return Math.abs(splitDistance(course, splitIndex0 + 1) - course.lapLengthM) < 0.5;
}

export type BoardHighlights = {
  /** Fastest full lap in the race (estimated splits never count). */
  raceBest: { runnerId: string; index: number; ms: number } | null;
  /** runnerId → split index of that runner's fastest full lap. */
  personalBest: Map<string, number>;
  /** `${runnerId}:${index}` for crossings whose tap or bib was edited. */
  edited: Set<string>;
};

export function cellKey(runnerId: string, index: number): string {
  return `${runnerId}:${index}`;
}

export function boardHighlights(event: EventState, races: RunnerRace[]): BoardHighlights {
  const editedTaps = new Set<string>();
  const editedMarks = new Set<string>();
  for (const e of event.edits ?? []) {
    if (e.tapId) editedTaps.add(e.tapId);
    if (e.markId) editedMarks.add(e.markId);
  }

  let raceBest: BoardHighlights["raceBest"] = null;
  const personalBest = new Map<string, number>();
  const edited = new Set<string>();

  for (const race of races) {
    const id = race.runner.id;
    let pb: { index: number; ms: number } | null = null;
    race.crossings.forEach((c, i) => {
      if (editedTaps.has(c.tapId) || editedMarks.has(c.markId)) edited.add(cellKey(id, i));
      const ms = race.splitMs[i];
      const dist = splitDistance(event.course, i + 1);
      if (
        ms == null ||
        !isFullLap(event.course, i) ||
        splitEstimated(race.crossings, i) ||
        isImpossibleSplit(ms, dist)
      ) {
        return;
      }
      if (!pb || ms < pb.ms) pb = { index: i, ms };
    });
    if (pb) {
      const best: { index: number; ms: number } = pb;
      personalBest.set(id, best.index);
      if (!raceBest || best.ms < raceBest.ms) raceBest = { runnerId: id, ...best };
    }
  }
  return { raceBest, personalBest, edited };
}

/** Rows for the current filter, ranked within it. */
export function boardRows(races: RunnerRace[], filter: BoardFilter): RunnerRace[] {
  if (filter === "all") return races;
  return races.filter((r) => inCategory(r.runner.category, filter)).slice().sort(compareRank);
}

/** Lap split for the small top line: 58.3 or 1:02.4 */
export function formatLapSplit(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const tenths = Math.floor(ms / 100);
  const sec = Math.floor(tenths / 10);
  const t = tenths % 10;
  if (sec < 60) return `${sec}.${t}`;
  const m = Math.floor(sec / 60);
  return `${m}:${String(sec % 60).padStart(2, "0")}.${t}`;
}

/** Running time for the big bottom line: 4:40 or 1:02:05 */
export function formatCum(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export function lapDownLabel(n: number): string {
  return n === 1 ? "−1 lap" : `−${n} laps`;
}
