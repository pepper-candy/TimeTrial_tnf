import {
  crossingDistance,
  minPlausibleSplitMs,
  splitDistance,
  splitDistances,
} from "./course";
import type {
  DataFlag,
  EventState,
  Mark,
  Pair,
  Runner,
  Tap,
} from "./types";
import { newId } from "./ids";

export function isLive<T extends { deletedAt?: number | null }>(x: T): boolean {
  return x.deletedAt == null;
}

export function liveTaps(taps: Tap[]): Tap[] {
  return taps.filter(isLive).slice().sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
}

export function liveMarks(marks: Mark[]): Mark[] {
  return marks.filter(isLive);
}

export function zipPairs(taps: Tap[], marks: Mark[]): Pair[] {
  const liveT = liveTaps(taps);
  const liveM = liveMarks(marks);
  const n = Math.max(liveT.length, liveM.length);
  const pairs: Pair[] = [];
  for (let i = 0; i < n; i++) {
    pairs.push({
      index: i,
      tap: liveT[i] ?? null,
      mark: liveM[i] ?? null,
    });
  }
  return pairs;
}

export function matchedCount(taps: Tap[], marks: Mark[]): number {
  return Math.min(liveTaps(taps).length, liveMarks(marks).length);
}

export function unmatchedTaps(taps: Tap[], marks: Mark[]): Tap[] {
  const liveT = liveTaps(taps);
  const liveM = liveMarks(marks);
  return liveT.slice(liveM.length);
}

export function unmatchedMarks(taps: Tap[], marks: Mark[]): Mark[] {
  const liveT = liveTaps(taps);
  const liveM = liveMarks(marks);
  return liveM.slice(liveT.length);
}

export function appendMark(marks: Mark[], bib: string): Mark[] {
  return [...marks, { id: newId(), bib: normalizeBib(bib) }];
}

export function deleteMark(marks: Mark[], index: number): Mark[] {
  if (index < 0 || index >= marks.length) return marks;
  return marks.filter((_, i) => i !== index);
}

export function insertMark(marks: Mark[], index: number, bib: string): Mark[] {
  const next = marks.slice();
  const i = Math.max(0, Math.min(index, next.length));
  next.splice(i, 0, { id: newId(), bib: normalizeBib(bib) });
  return next;
}

export function swapMarks(marks: Mark[], i: number, j: number): Mark[] {
  if (i < 0 || j < 0 || i >= marks.length || j >= marks.length || i === j) {
    return marks;
  }
  const next = marks.slice();
  const a = next[i];
  next[i] = next[j];
  next[j] = a;
  return next;
}

export function reassignMark(marks: Mark[], index: number, bib: string): Mark[] {
  if (index < 0 || index >= marks.length) return marks;
  const next = marks.slice();
  next[index] = { ...next[index], bib: normalizeBib(bib) };
  return next;
}

export function normalizeBib(bib: string): string {
  return bib.trim().replace(/^0+(?=\d)/, "");
}

export function appendTap(taps: Tap[], tap: Tap): Tap[] {
  if (taps.some((t) => t.id === tap.id)) return taps;
  return [...taps, tap].sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
}

export function undoLastTap(taps: Tap[], tapId?: string): Tap[] {
  if (taps.length === 0) return taps;
  if (tapId) {
    const idx = taps.findIndex((t) => t.id === tapId);
    if (idx < 0) return taps;
    return taps.filter((_, i) => i !== idx);
  }
  return taps.slice(0, -1);
}

export type Crossing = {
  index: number;
  runnerId: string | null;
  bib: string;
  t: number;
  elapsedMs: number;
  distanceM: number;
  estimated: boolean;
  tapId: string;
  markId: string;
};

export type RunnerRace = {
  runner: Runner;
  crossings: Crossing[];
  splitMs: number[];
  lastEpoch: number | null;
  lastElapsed: number | null;
  finished: boolean;
  finishMs: number | null;
  lapDown: number;
  bell: boolean;
  eta: number | null;
  predictedNextMs: number | null;
  flags: DataFlag[];
};

export function runnerByBib(runners: Runner[], bib: string): Runner | undefined {
  const n = normalizeBib(bib);
  return runners.find((r) => normalizeBib(r.bib) === n);
}

export function crossingsOf(
  event: EventState,
): Crossing[] {
  const start = event.startedAt ?? 0;
  const taps = liveTaps(event.taps);
  const marks = liveMarks(event.marks);
  const n = Math.min(taps.length, marks.length);
  const out: Crossing[] = [];
  for (let i = 0; i < n; i++) {
    const tap = taps[i];
    const mark = marks[i];
    const runner = runnerByBib(event.runners, mark.bib);
    const runnerCrossingsSoFar = out.filter((c) => c.bib === normalizeBib(mark.bib)).length;
    const distanceM = crossingDistance(event.course, runnerCrossingsSoFar + 1);
    out.push({
      index: i,
      runnerId: runner?.id ?? null,
      bib: normalizeBib(mark.bib),
      t: tap.t,
      elapsedMs: event.startedAt != null ? tap.t - start : 0,
      distanceM,
      estimated: Boolean(tap.estimated),
      tapId: tap.id,
      markId: mark.id,
    });
  }
  return out;
}

/** Split i is estimated if either bounding tap is estimated. */
export function splitEstimated(crossings: Crossing[], i: number): boolean {
  if (crossings[i]?.estimated) return true;
  if (i > 0 && crossings[i - 1]?.estimated) return true;
  return false;
}

export function buildRunnerRaces(event: EventState, now = 0): RunnerRace[] {
  void now;
  const all = crossingsOf(event);
  const byBib = new Map<string, Crossing[]>();
  for (const c of all) {
    const list = byBib.get(c.bib) ?? [];
    list.push(c);
    byBib.set(c.bib, list);
  }

  const races: RunnerRace[] = event.runners.map((runner) => {
    const xs = (byBib.get(normalizeBib(runner.bib)) ?? []).slice().sort((a, b) => a.t - b.t);
    const splitMs: number[] = [];
    for (let i = 0; i < xs.length; i++) {
      const prev = i === 0 ? (event.startedAt ?? xs[0].t) : xs[i - 1].t;
      splitMs.push(xs[i].t - prev);
    }
    const finished = xs.length >= event.course.requiredCrossings;
    const counted = xs.slice(0, event.course.requiredCrossings);
    const countedSplits = splitMs.slice(0, event.course.requiredCrossings);
    const bell = !finished && counted.length === event.course.requiredCrossings - 1;
    const flags = flagsForRunner(event, runner, xs, splitMs);
    const predictedNextMs = finished ? null : predictNextSplitMs(event, countedSplits, counted.length);
    const last = counted[counted.length - 1];
    const lastEpoch = last?.t ?? null;
    const eta =
      lastEpoch != null && predictedNextMs != null ? lastEpoch + predictedNextMs : null;

    return {
      runner,
      crossings: counted,
      splitMs: countedSplits,
      lastEpoch,
      lastElapsed: last && event.startedAt != null ? last.t - event.startedAt : last ? 0 : null,
      finished,
      finishMs:
        finished && event.startedAt != null
          ? counted[event.course.requiredCrossings - 1].t - event.startedAt
          : null,
      lapDown: 0,
      bell,
      eta,
      predictedNextMs,
      flags,
    };
  });

  races.sort(compareRank);
  const leader = races[0];
  for (const r of races) {
    r.lapDown = r.finished || !leader ? 0 : lapsBehind(leader, r);
  }
  return races;
}

/**
 * Truly lapped: the leader had already crossed more times when this runner last crossed.
 * Merely trailing mid-lap (leader crossed, runner about to) is not lapped.
 */
export function lapsBehind(leader: RunnerRace, r: RunnerRace): number {
  const c = r.crossings.length;
  if (c === 0) return Math.max(0, leader.crossings.length - 1);
  const t = r.crossings[c - 1].t;
  const leaderThen = leader.crossings.filter((x) => x.t <= t).length;
  return Math.max(0, leaderThen - c);
}

export function compareRank(a: RunnerRace, b: RunnerRace): number {
  if (b.crossings.length !== a.crossings.length) {
    return b.crossings.length - a.crossings.length;
  }
  const at = a.lastEpoch ?? Infinity;
  const bt = b.lastEpoch ?? Infinity;
  if (at !== bt) return at - bt;
  return Number(a.runner.bib) - Number(b.runner.bib) || a.runner.bib.localeCompare(b.runner.bib);
}

export function predictedTileOrder(races: RunnerRace[]): RunnerRace[] {
  return races
    .filter((r) => !r.finished && r.crossings.length > 0)
    .slice()
    .sort((a, b) => {
      const ae = a.eta ?? Infinity;
      const be = b.eta ?? Infinity;
      if (ae !== be) return ae - be;
      return compareRank(a, b);
    });
}

function predictNextSplitMs(
  event: EventState,
  splitMs: number[],
  crossingsDone: number,
): number | null {
  const nextDist = splitDistance(event.course, crossingsDone + 1);
  if (nextDist <= 0) return null;
  if (splitMs.length === 0) return null;

  const distDone = splitDistances(event.course).slice(0, splitMs.length);
  const paces: number[] = [];
  for (let i = 0; i < splitMs.length; i++) {
    if (distDone[i] > 0) paces.push(splitMs[i] / distDone[i]);
  }
  if (paces.length === 0) return null;
  const recent = paces.slice(-2);
  const pace = recent.reduce((s, x) => s + x, 0) / recent.length;
  return pace * nextDist;
}

function flagsForRunner(
  event: EventState,
  runner: Runner,
  xs: Crossing[],
  splitMs: number[],
): DataFlag[] {
  const flags: DataFlag[] = [];
  if (xs.length > event.course.requiredCrossings) {
    flags.push({
      kind: "over-count",
      runnerId: runner.id,
      bib: runner.bib,
      index: xs[event.course.requiredCrossings].index,
      detail: `${xs.length}/${event.course.requiredCrossings}`,
    });
  }
  for (let i = 0; i < splitMs.length; i++) {
    const dist = splitDistance(event.course, i + 1);
    const minMs = minPlausibleSplitMs(dist);
    if (splitMs[i] < minMs) {
      flags.push({
        kind: "too-fast",
        runnerId: runner.id,
        bib: runner.bib,
        index: xs[i].index,
        detail: `${Math.round(splitMs[i])}ms`,
      });
    }
  }
  return flags;
}

export function tapElapsed(event: EventState, tap: Tap): number {
  if (event.startedAt == null) return 0;
  return Math.max(0, tap.t - event.startedAt);
}

/** Marker is expected to trail Timer by a couple of bodies. */
export const MARKER_LAG_OK = 2;

export function sequenceLag(event: EventState): { taps: number; marks: number; lag: number } {
  const taps = liveTaps(event.taps).length;
  const marks = liveMarks(event.marks).length;
  return { taps, marks, lag: taps - marks };
}

export function collectFlags(event: EventState, races: RunnerRace[]): DataFlag[] {
  const flags: DataFlag[] = [];
  for (const r of races) flags.push(...r.flags);
  const n = matchedCount(event.taps, event.marks);
  const marks = liveMarks(event.marks);
  for (let i = 0; i < n; i++) {
    const bib = marks[i].bib;
    if (!runnerByBib(event.runners, bib)) {
      flags.push({
        kind: "unknown-bib",
        bib,
        index: i,
        detail: bib,
      });
    }
  }
  const { taps, marks: markN, lag } = sequenceLag(event);
  if (Math.abs(lag) > MARKER_LAG_OK) {
    flags.push({
      kind: "count-lag",
      bib: "",
      index: -1,
      detail: `${taps} taps · ${markN} marks`,
    });
  }
  return flags;
}
