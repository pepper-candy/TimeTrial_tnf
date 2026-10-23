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

export function sprintersForAnalyse(event: EventState): Runner[] {
  return event.runners
    .filter(isValidSprinter)
    .slice()
    .sort((a, b) => {
      const la = Number(a.bib);
      const lb = Number(b.bib);
      if (Number.isFinite(la) && Number.isFinite(lb) && la !== lb) return la - lb;
      return a.bib.localeCompare(b.bib, undefined, { numeric: true });
    });
}
