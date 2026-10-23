import { isValidSprinter } from "@/lib/board";
import type { EventState, Runner } from "@/lib/types";

/** Finish line is the red centre vertical (normalised x). */
export const FINISH_LINE_X = 0.5;

/**
 * Map a chest Y (0–1) to lane index 1…laneCount (top → lane 1).
 * Side-view finish cam: vertical finish line, lanes stacked by height.
 */
export function laneFromY(chestY: number, laneCount: number): number {
  const n = Math.max(1, laneCount);
  const i = Math.min(n - 1, Math.max(0, Math.floor(chestY * n)));
  return i + 1;
}

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
