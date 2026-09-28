import { crossingDistance, splitDistance } from "./course";
import type { EventState } from "./types";
import type { RunnerRace } from "./race";

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
};

export function computeRunnerStats(
  event: EventState,
  race: RunnerRace,
  leader: RunnerRace | null,
): RunnerStats {
  const start = event.startedAt;
  const last = race.crossings[race.crossings.length - 1];
  const distM = last ? last.distanceM : 0;
  const elapsed = last && start != null ? last.t - start : null;

  const avgPaceSecPerKm =
    elapsed != null && distM > 0 ? elapsed / 1000 / (distM / 1000) : null;
  const speedKmh =
    elapsed != null && distM > 0 ? distM / 1000 / (elapsed / 3_600_000) : null;

  const fullLapIdx: number[] = [];
  for (let i = 0; i < race.splitMs.length; i++) {
    const d = splitDistance(event.course, i + 1);
    if (Math.abs(d - event.course.lapLengthM) < 0.5) fullLapIdx.push(i);
  }
  const full = fullLapIdx.map((i) => ({
    i,
    ms: race.splitMs[i],
    d: splitDistance(event.course, i + 1),
  }));

  let fastestLapSec: number | null = null;
  let slowestLapSec: number | null = null;
  let fastestLapPaceSecPerKm: number | null = null;
  let slowestLapPaceSecPerKm: number | null = null;
  if (full.length > 0) {
    const fastest = full.reduce((a, b) => (a.ms < b.ms ? a : b));
    const slowest = full.reduce((a, b) => (a.ms > b.ms ? a : b));
    fastestLapSec = fastest.ms / 1000;
    slowestLapSec = slowest.ms / 1000;
    fastestLapPaceSecPerKm = fastest.ms / 1000 / (fastest.d / 1000);
    slowestLapPaceSecPerKm = slowest.ms / 1000 / (slowest.d / 1000);
  }

  const lastIdx = race.splitMs.length - 1;
  const lastLapPaceSecPerKm =
    lastIdx >= 0
      ? race.splitMs[lastIdx] / 1000 / (splitDistance(event.course, lastIdx + 1) / 1000)
      : null;

  let consistencyPct: number | null = null;
  if (full.length >= 2) {
    const mean = full.reduce((s, x) => s + x.ms, 0) / full.length;
    const variance = full.reduce((s, x) => s + (x.ms - mean) ** 2, 0) / full.length;
    const sd = Math.sqrt(variance);
    consistencyPct = mean > 0 ? (sd / mean) * 100 : null;
  }

  let projectedFinishMs: number | null = null;
  if (race.finished && race.finishMs != null) {
    projectedFinishMs = race.finishMs;
  } else if (avgPaceSecPerKm != null && start != null) {
    const remainingM = event.course.totalDistanceM - distM;
    const remainingMs = (remainingM / 1000) * avgPaceSecPerKm * 1000;
    projectedFinishMs = (elapsed ?? 0) + remainingMs;
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
  };
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

function interpolateTime(
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
