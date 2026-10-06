import { splitDistance } from "./course";
import { compareRank, type Crossing, type RunnerRace } from "./race";
import { isImpossibleSplit } from "./stats";
import type { CourseConfig } from "./types";

/** Counted crossings that mean the runner has started (or passed) the second-last lap. */
export function bellCallThreshold(requiredCrossings: number): number {
  return requiredCrossings - 2;
}

export function qualifiesForBellCall(race: RunnerRace, requiredCrossings: number): boolean {
  return race.crossings.length >= bellCallThreshold(requiredCrossings);
}

function splitMetres(crossings: Crossing[], i: number): number {
  const cur = crossings[i]?.distanceM ?? 0;
  const prev = i > 0 ? (crossings[i - 1]?.distanceM ?? 0) : 0;
  return cur - prev;
}

/** Most recent split that `isImpossibleSplit` would keep, with its metres from crossing distances. */
export function lastPlausibleSplit(race: RunnerRace): { ms: number; distM: number } | null {
  for (let i = race.splitMs.length - 1; i >= 0; i--) {
    const distM = splitMetres(race.crossings, i);
    const ms = race.splitMs[i];
    if (isImpossibleSplit(ms, distM)) continue;
    return { ms, distM };
  }
  return null;
}

/** When they should start the last lap: last crossing + scaled recent lap. */
export function expectedLastLapStartAt(race: RunnerRace, course: CourseConfig): number | null {
  const last = race.crossings.at(-1);
  const lap = lastPlausibleSplit(race);
  if (!last || !lap || lap.distM <= 0) return null;
  const nextM = splitDistance(course, race.crossings.length + 1);
  if (nextM <= 0) return null;
  return last.t + lap.ms * (nextM / lap.distM);
}

export type BellCallKind = "finished" | "bell" | "now" | "wait" | "none";

export type BellCallStatus = {
  kind: BellCallKind;
  label: string;
};

export function formatBellCountdown(remainingMs: number): string {
  const sec = Math.max(0, Math.floor(remainingMs / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function bellCallStatus(
  race: RunnerRace,
  course: CourseConfig,
  now: number,
): BellCallStatus {
  if (race.finished) return { kind: "finished", label: "Finished" };
  if (race.bell) return { kind: "bell", label: "Bell lap" };
  const eta = expectedLastLapStartAt(race, course);
  if (eta == null) return { kind: "none", label: "—" };
  const remaining = eta - now;
  if (remaining <= 0) return { kind: "now", label: "Now" };
  return { kind: "wait", label: formatBellCountdown(remaining) };
}

/** Append newly qualifying ids in current `compareRank` order; never remove or reorder. */
export function appendBellCallIds(order: string[], races: RunnerRace[], requiredCrossings: number): string[] {
  const seen = new Set(order);
  const next = order.slice();
  const ranked = races.slice().sort(compareRank);
  for (const race of ranked) {
    const id = race.runner.id;
    if (seen.has(id) || !qualifiesForBellCall(race, requiredCrossings)) continue;
    next.push(id);
    seen.add(id);
  }
  return next;
}
