import { crossingDistance, splitDistance } from "./course";
import type { EventState } from "./types";
import { splitEstimated, type RunnerRace } from "./race";

/** Quicker than this cannot be a running lap (double-tap or a test mash). */
export const IMPOSSIBLE_MS_PER_400 = 20_000;

export function impossibleSplitMs(distanceM: number): number {
  return (distanceM / 400) * IMPOSSIBLE_MS_PER_400;
}

export function isImpossibleSplit(ms: number, distanceM: number): boolean {
  return distanceM > 0 && ms < impossibleSplitMs(distanceM);
}

export type RunnerStats = {
  avgPaceSecPerKm: number | null;
  lastLapPaceSecPerKm: number | null;
  fastestLapSec: number | null;
  slowestLapSec: number | null;
  fastestLapPaceSecPerKm: number | null;
  slowestLapPaceSecPerKm: number | null;
  consistencyPct: number | null;
  speedKmh: number | null;
  projectedFinishMs: number | null;
  gapToLeaderMs: number | null;
  kmSplits: { km: number; elapsedMs: number; splitMs: number; paceSecPerKm: number }[];
  vsTargetSecPerKm: number | null;
  /** Splits quicker than 20s per 400m. Left out of pace, speed, and lap records. */
  ignoredSplits: number;
};

export function computeRunnerStats(
  event: EventState,
  race: RunnerRace,
  leader: RunnerRace | null,
): RunnerStats {
  const start = event.startedAt;
  const last = race.crossings[race.crossings.length - 1];
  const wallDist = last ? last.distanceM : 0;
  const wallElapsed = last && start != null ? last.t - start : null;
  const effort = plausibleEffort(event, race);
  const distM = effort.ignored === 0 ? wallDist : effort.distM;
  const elapsed = effort.ignored === 0 ? wallElapsed : effort.elapsedMs;

  const avgPaceSecPerKm =
    elapsed != null && distM > 0 ? elapsed / 1000 / (distM / 1000) : null;
  const speedKmh =
    elapsed != null && elapsed > 0 && distM > 0 ? distM / 1000 / (elapsed / 3_600_000) : null;

  const laps = fullLapsFor(event, race);
  const pair = fastestSlowestLap(laps);
  let fastestLapSec: number | null = null;
  let slowestLapSec: number | null = null;
  let fastestLapPaceSecPerKm: number | null = null;
  let slowestLapPaceSecPerKm: number | null = null;
  if (pair && !pair.fast.estimated) {
    fastestLapSec = pair.fast.ms / 1000;
    fastestLapPaceSecPerKm = pair.fast.ms / 1000 / (pair.fast.distanceM / 1000);
  }
  if (pair) {
    slowestLapSec = pair.slow.ms / 1000;
    slowestLapPaceSecPerKm = pair.slow.ms / 1000 / (pair.slow.distanceM / 1000);
  }

  let lastLapPaceSecPerKm: number | null = null;
  for (let i = race.splitMs.length - 1; i >= 0; i--) {
    const d = splitDistance(event.course, i + 1);
    const ms = race.splitMs[i];
    if (isImpossibleSplit(ms, d) || splitEstimated(race.crossings, i)) continue;
    lastLapPaceSecPerKm = ms / 1000 / (d / 1000);
    break;
  }

  const consistencyPct = consistencyPctOf(laps);

  let projectedFinishMs: number | null = null;
  if (race.finished && race.finishMs != null) {
    projectedFinishMs = race.finishMs;
  } else if (avgPaceSecPerKm != null && start != null && elapsed != null) {
    const remainingM = event.course.totalDistanceM - distM;
    const remainingMs = (remainingM / 1000) * avgPaceSecPerKm * 1000;
    projectedFinishMs = elapsed + remainingMs;
  }

  let gapToLeaderMs: number | null = null;
  if (leader && leader.runner.id !== race.runner.id && last && leader.crossings.length) {
    if (race.finished && leader.finished && race.finishMs != null && leader.finishMs != null) {
      gapToLeaderMs = race.finishMs - leader.finishMs;
    } else if (race.crossings.length === leader.crossings.length && leader.lastEpoch != null) {
      gapToLeaderMs = last.t - leader.lastEpoch;
    } else {
      const n = Math.min(race.crossings.length, leader.crossings.length);
      if (n > 0) {
        gapToLeaderMs = race.crossings[n - 1].t - leader.crossings[n - 1].t;
      }
    }
  } else if (leader && leader.runner.id === race.runner.id) {
    gapToLeaderMs = 0;
  }

  const kmSplits = kmSplitsFrom(event, race);

  const vsTargetSecPerKm =
    event.course.targetPaceSecPerKm != null && avgPaceSecPerKm != null
      ? avgPaceSecPerKm - event.course.targetPaceSecPerKm
      : null;

  return {
    avgPaceSecPerKm,
    lastLapPaceSecPerKm,
    fastestLapSec,
    slowestLapSec,
    fastestLapPaceSecPerKm,
    slowestLapPaceSecPerKm,
    consistencyPct,
    speedKmh,
    projectedFinishMs,
    gapToLeaderMs,
    kmSplits,
    vsTargetSecPerKm,
    ignoredSplits: effort.ignored,
  };
}

/** Distance and time of splits that could be real running. Impossible taps are counted, not credited. */
export function plausibleEffort(event: EventState, race: RunnerRace): {
  distM: number;
  elapsedMs: number;
  ignored: number;
} {
  let distM = 0;
  let elapsedMs = 0;
  let ignored = 0;
  for (let i = 0; i < race.splitMs.length; i++) {
    const d = splitDistance(event.course, i + 1);
    const ms = race.splitMs[i];
    if (isImpossibleSplit(ms, d)) {
      ignored += 1;
      continue;
    }
    distM += d;
    elapsedMs += ms;
  }
  return { distM, elapsedMs, ignored };
}

export function kmSplitsFrom(event: EventState, race: RunnerRace) {
  const start = event.startedAt;
  if (start == null || race.crossings.length === 0) return [];
  const maxKm = Math.floor(event.course.totalDistanceM / 1000);
  const points = [{ d: 0, t: start }];
  for (const c of race.crossings) points.push({ d: c.distanceM, t: c.t });

  const out: { km: number; elapsedMs: number; splitMs: number; paceSecPerKm: number }[] = [];
  let prevElapsed = 0;
  for (let km = 1; km <= maxKm; km++) {
    const t = interpolateTime(points, km * 1000);
    if (t == null) break;
    const elapsedMs = t - start;
    const splitMs = elapsedMs - prevElapsed;
    out.push({
      km,
      elapsedMs,
      splitMs,
      paceSecPerKm: splitMs / 1000,
    });
    prevElapsed = elapsedMs;
  }
  return out;
}

export function interpolateTime(
  points: { d: number; t: number }[],
  distanceM: number,
): number | null {
  if (distanceM <= 0) return points[0]?.t ?? null;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (distanceM <= b.d || i === points.length - 1) {
      if (b.d === a.d) return b.t;
      if (distanceM > b.d) return null;
      const u = (distanceM - a.d) / (b.d - a.d);
      return a.t + u * (b.t - a.t);
    }
  }
  return null;
}

export type KmMark = {
  km: number;
  elapsedMs: number;
  exact: boolean;
};

export function raceDistancePoints(event: EventState, race: RunnerRace) {
  const start = event.startedAt;
  if (start == null) return [];
  return [{ d: 0, t: start }, ...race.crossings.map((c) => ({ d: c.distanceM, t: c.t }))];
}

/** Whole-km elapsed times; `exact` when that km lands on a finish-line crossing. */
export function kmMarksFor(event: EventState, race: RunnerRace): KmMark[] {
  const start = event.startedAt;
  const last = race.crossings[race.crossings.length - 1];
  if (start == null || !last) return [];
  const points = raceDistancePoints(event, race);
  const exactAt = new Set(
    race.crossings
      .filter((c) => {
        const km = c.distanceM / 1000;
        return km >= 1 && Math.abs(km - Math.round(km)) < 0.0005;
      })
      .map((c) => Math.round(c.distanceM / 1000)),
  );
  const maxKm = Math.max(1, Math.floor(Math.min(last.distanceM, event.course.totalDistanceM) / 1000));
  const out: KmMark[] = [];
  for (let km = 1; km <= maxKm; km++) {
    const t = interpolateTime(points, km * 1000);
    if (t == null) break;
    out.push({ km, elapsedMs: t - start, exact: exactAt.has(km) });
  }
  return out;
}

export type FullLap = {
  /** 1-based among full (lap-length) splits only; first 200 m is not a lap. */
  lap: number;
  ms: number;
  distanceM: number;
  estimated: boolean;
};

export function fullLapsFor(event: EventState, race: RunnerRace): FullLap[] {
  const out: FullLap[] = [];
  let n = 0;
  for (let i = 0; i < race.splitMs.length; i++) {
    const d = splitDistance(event.course, i + 1);
    if (Math.abs(d - event.course.lapLengthM) < 0.5) {
      n += 1;
      out.push({
        lap: n,
        ms: race.splitMs[i],
        distanceM: d,
        estimated: splitEstimated(race.crossings, i),
      });
    }
  }
  return out;
}

export type HalfSplit = {
  firstMs: number;
  secondMs: number;
  deltaMs: number;
};

/** First half vs second half of the race distance (or of distance run, if DNF). */
export function halfSplitFor(event: EventState, race: RunnerRace): HalfSplit | null {
  const start = event.startedAt;
  const last = race.crossings[race.crossings.length - 1];
  if (start == null || !last) return null;
  const span = race.finished ? event.course.totalDistanceM : last.distanceM;
  const halfM = span / 2;
  if (halfM < 1 || last.distanceM < halfM - 0.5) return null;
  const points = raceDistancePoints(event, race);
  const tHalf = interpolateTime(points, halfM);
  if (tHalf == null) return null;
  const firstMs = tHalf - start;
  const secondMs = last.t - tHalf;
  if (firstMs <= 0 || secondMs <= 0) return null;
  if (isImpossibleSplit(firstMs, halfM) || isImpossibleSplit(secondMs, halfM)) return null;
  return { firstMs, secondMs, deltaMs: secondMs - firstMs };
}

export function usableLaps(laps: FullLap[]): FullLap[] {
  return laps.filter((l) => !isImpossibleSplit(l.ms, l.distanceM));
}

/** Spread of real full laps, as a percent of the mean. Impossible taps are left out. */
export function consistencyPctOf(laps: FullLap[]): number | null {
  const consist = usableLaps(laps).filter((l) => !l.estimated);
  if (consist.length < 2) return null;
  const mean = consist.reduce((s, x) => s + x.ms, 0) / consist.length;
  const variance = consist.reduce((s, x) => s + (x.ms - mean) ** 2, 0) / consist.length;
  return mean > 0 ? (Math.sqrt(variance) / mean) * 100 : null;
}

export function fastestSlowestLap(laps: FullLap[]): {
  fast: FullLap;
  slow: FullLap;
} | null {
  const pool = usableLaps(laps);
  if (pool.length === 0) return null;
  const real = pool.filter((l) => !l.estimated);
  return {
    fast: (real.length ? real : pool).reduce((a, b) => (a.ms <= b.ms ? a : b)),
    slow: pool.reduce((a, b) => (a.ms > b.ms ? a : b)),
  };
}

export function csvOfEvent(event: EventState, races: RunnerRace[]): string {
  const maxSplits = event.course.requiredCrossings;
  const headers = [
    "Place",
    "Bib",
    "Name",
    "StudentID",
    "Category",
    "Status",
    "Crossings",
    "Finish",
    "AvgPace",
    ...Array.from({ length: maxSplits }, (_, i) => `Split${i + 1}`),
  ];
  const leader = races[0] ?? null;
  const lines = [headers.join(",")];
  races.forEach((r, i) => {
    const stats = computeRunnerStats(event, r, leader);
    const finish =
      r.finishMs != null ? (r.finishMs / 1000).toFixed(2) : "";
    const avg = stats.avgPaceSecPerKm != null ? stats.avgPaceSecPerKm.toFixed(1) : "";
    const splits = Array.from({ length: maxSplits }, (_, k) =>
      r.splitMs[k] != null ? (r.splitMs[k] / 1000).toFixed(2) : "",
    );
    const row = [
      String(i + 1),
      csv(r.runner.bib),
      csv(r.runner.name),
      csv(r.runner.studentId),
      csv(r.runner.category || ""),
      r.finished ? "Finished" : r.bell ? "Bell" : String(r.crossings.length),
      String(r.crossings.length),
      finish,
      avg,
      ...splits,
    ];
    lines.push(row.join(","));
  });
  return lines.join("\n") + "\n";
}

function csv(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

export { crossingDistance };
