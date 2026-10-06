import { crossingDistance } from "./course";
import { normalizeCode } from "./ids";
import type { RunnerRace } from "./race";
import { isImpossibleSplit } from "./stats";
import type { CourseConfig } from "./types";

export function onBellCallList(race: RunnerRace, requiredCrossings: number): boolean {
  return race.crossings.length >= requiredCrossings - 2;
}

/** Most recent split that would not be dropped as impossible. */
export function lastPlausibleLap(race: RunnerRace): { ms: number; metres: number } | null {
  for (let i = race.splitMs.length - 1; i >= 0; i--) {
    const end = race.crossings[i];
    const start = race.crossings[i - 1];
    const metres = end.distanceM - (start?.distanceM ?? 0);
    const ms = race.splitMs[i];
    if (metres > 0 && !isImpossibleSplit(ms, metres)) return { ms, metres };
  }
  return null;
}

/** Epoch when they should start the last lap: last crossing + scaled last plausible lap. */
export function expectedLastLapStartMs(race: RunnerRace, course: CourseConfig): number | null {
  const last = race.crossings.at(-1);
  const lap = lastPlausibleLap(race);
  if (!last || !lap) return null;
  const nextM = crossingDistance(course, race.crossings.length + 1) - last.distanceM;
  if (nextM <= 0) return null;
  return last.t + (lap.ms / lap.metres) * nextM;
}

export function formatBellCountdown(msLeft: number): string {
  const sec = Math.max(0, Math.ceil(msLeft / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function vibrateBell() {
  try {
    navigator.vibrate?.(200);
  } catch {
    /* unsupported (iPhone) */
  }
}

function read(key: string): string {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function write(key: string, value: string | null) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

export function bellOrderKey(code: string) {
  return `tt:bell-order:${normalizeCode(code)}`;
}

export function bellRungKey(code: string, runnerId: string) {
  return `tt:bell-rung:${normalizeCode(code)}:${runnerId}`;
}

export function loadBellOrder(code: string): string[] {
  try {
    const list = JSON.parse(read(bellOrderKey(code)) || "[]") as unknown;
    return Array.isArray(list) ? list.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function saveBellOrder(code: string, ids: string[]) {
  write(bellOrderKey(code), JSON.stringify(ids));
}

export function loadBellRung(code: string, ids: string[]): Set<string> {
  const out = new Set<string>();
  for (const id of ids) {
    if (read(bellRungKey(code, id)) === "1") out.add(id);
  }
  return out;
}

export function setBellRung(code: string, runnerId: string, rung: boolean) {
  write(bellRungKey(code, runnerId), rung ? "1" : null);
}
