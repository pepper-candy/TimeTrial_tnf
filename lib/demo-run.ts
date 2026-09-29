import { appendMark, appendTap } from "./race";
import type { EventState } from "./types";

/**
 * Virtual "now" in event time: demo races can run faster than wall clock,
 * and End race freezes everyone at endedAt.
 */
export function raceNow(event: EventState, wallNow: number): number {
  const wall =
    event.status === "finished" && event.endedAt != null ? event.endedAt : wallNow;
  if (!event.demo || event.startedAt == null) return wall;
  const speed = event.demoSpeed > 0 ? event.demoSpeed : 1;
  return Math.round(event.startedAt + (wall - event.startedAt) * speed);
}

export function advanceDemo(event: EventState, now: number): EventState {
  if (!event.demo || !event.demoPlan || event.startedAt == null) return event;
  const due: { t: number; bib: string; key: string }[] = [];
  for (const plan of event.demoPlan) {
    let acc = 0;
    for (let i = 0; i < plan.splitsMs.length; i++) {
      acc += plan.splitsMs[i];
      const t = event.startedAt + acc;
      if (t <= now) {
        due.push({ t, bib: plan.bib, key: `demo:${plan.runnerId}:${i}` });
      }
    }
  }
  due.sort((a, b) => a.t - b.t || a.bib.localeCompare(b.bib, "en", { numeric: true }));

  let taps = event.taps;
  let marks = event.marks;
  const tapIds = new Set(taps.map((x) => x.id));
  for (const d of due) {
    if (tapIds.has(d.key)) continue;
    taps = appendTap(taps, { id: d.key, t: Math.round(d.t) });
    tapIds.add(d.key);
    if (event.demoAutoMark) {
      marks = appendMark(marks, d.bib);
    }
  }
  return { ...event, taps, marks };
}
