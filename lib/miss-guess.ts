import { splitDistance } from "./course";
import { liveTaps, normalizeBib, zipPairs } from "./race";
import type { EventState, Runner } from "./types";

function firstCrossingMs(event: EventState): number | null {
  if (event.startedAt == null) return null;
  const dist = splitDistance(event.course, 1);
  const pace = event.course.targetPaceSecPerKm;
  if (pace != null && pace > 0) {
    return event.startedAt + (dist / 1000) * pace * 1000;
  }
  return event.startedAt + 40_000;
}

function expectedArrival(event: EventState, bib: string, skipMarkId: string): number | null {
  const n = normalizeBib(bib);
  const mine: number[] = [];
  for (const pair of zipPairs(event.taps, event.marks, event.syncs)) {
    if (!pair.tap || !pair.mark || pair.mark.id === skipMarkId) continue;
    if (normalizeBib(pair.mark.bib) !== n) continue;
    mine.push(pair.tap.t);
  }
  mine.sort((a, b) => a - b);
  if (mine.length >= 2) {
    const last = mine[mine.length - 1];
    const prev = mine[mine.length - 2];
    return last + (last - prev);
  }
  if (mine.length === 1 && event.startedAt != null) {
    return mine[0] + (mine[0] - event.startedAt);
  }
  return firstCrossingMs(event);
}

function arrivalMs(event: EventState, markId: string): number | null {
  const pair = zipPairs(event.taps, event.marks, event.syncs).find((p) => p.mark?.id === markId);
  if (pair?.tap) return pair.tap.t;
  const taps = liveTaps(event.taps);
  if (taps.length > 0) return taps[taps.length - 1].t;
  return event.startedAt;
}

/** Roster runners most likely to be this miss / unknown mark, by expected arrival vs the paired tap. */
export function guessMissRunners(event: EventState, markId: string, limit = 3): Runner[] {
  const at = arrivalMs(event, markId);
  if (at == null || limit <= 0) return [];
  const scored: { runner: Runner; err: number; i: number }[] = [];
  event.runners.forEach((runner, i) => {
    const expected = expectedArrival(event, runner.bib, markId);
    if (expected == null) return;
    scored.push({ runner, err: Math.abs(expected - at), i });
  });
  scored.sort((a, b) => a.err - b.err || a.i - b.i);
  return scored.slice(0, limit).map((s) => s.runner);
}
