import { isValidSprinter } from "@/lib/board";
import type { EventState, Runner } from "@/lib/types";

/** Finish line is the red centre vertical (normalised x). */
export const FINISH_LINE_X = 0.5;

/**
 * Fallback equal-split Y → lane (top → lane 1).
 * Prefer `mapFeetToLane` / `feetPointFromBox` from `@/lib/client/lane-guides`
 * once calibrated guides exist for the event.
 */
export function laneFromY(chestY: number, laneCount: number): number {
  const n = Math.max(1, laneCount);
  const i = Math.min(n - 1, Math.max(0, Math.floor(chestY * n)));
  return i + 1;
}

/** Re-export Agent 3 lane-map helpers (same polygons as the overlay). */
export {
  feetPointFromBox,
  loadLaneGuides,
  mapFeetToLane,
  pointInLane,
  type LaneGuides,
  type NormPoint,
} from "@/lib/client/lane-guides";

function byBib(a: Runner, b: Runner): number {
  const la = Number(a.bib);
  const lb = Number(b.bib);
  if (Number.isFinite(la) && Number.isFinite(lb) && la !== lb) return la - lb;
  return a.bib.localeCompare(b.bib, undefined, { numeric: true });
}

/**
 * Every seeded lane, bib-sorted. Lane i+1 is the i-th grid position — the
 * camera sees the FULL lane grid, so empty placeholder lanes (name + SID
 * blank) must keep their slot. Deriving geometry/pairing from the filtered
 * valid-sprinter list compresses the grid and shifts every band one lane,
 * which lands YOLO times/snapshots on the wrong board rows.
 */
export function sprintLanes(event: EventState): { lane: number; runner: Runner }[] {
  return event.runners.slice().sort(byBib).map((runner, i) => ({ lane: i + 1, runner }));
}

/** Camera lane-band / YOLO track count = all seeded lanes, not just valid ones. */
export function sprintLaneCount(event: EventState): number {
  return Math.max(1, event.runners.length);
}

/** Valid sprinters only (name or SID), in lane order — for display/analysis rows. */
export function sprintersForAnalyse(event: EventState): Runner[] {
  return sprintLanes(event)
    .filter(({ runner }) => isValidSprinter(runner))
    .map(({ runner }) => runner);
}
