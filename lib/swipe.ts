/** Commit once the row has travelled this far left. */
export const SWIPE_COMMIT_RATIO = 0.4;

/** A short left flick also commits, once the row has actually moved. */
export const SWIPE_FLICK_VELOCITY = -0.5;
export const SWIPE_FLICK_MIN_RATIO = 0.12;

export type SwipeDecision = "commit" | "cancel";

/**
 * Decide whether a finished left drag deletes the row.
 * `dx` is the horizontal travel in px (negative is left).
 * `velocity` is average px/ms over the gesture (negative is left).
 */
export function decideSwipe(input: {
  dx: number;
  width: number;
  velocity: number;
}): SwipeDecision {
  const { dx, width, velocity } = input;
  if (!(width > 0) || !(dx < 0)) return "cancel";
  const ratio = -dx / width;
  if (ratio >= SWIPE_COMMIT_RATIO) return "commit";
  if (velocity <= SWIPE_FLICK_VELOCITY && ratio >= SWIPE_FLICK_MIN_RATIO) return "commit";
  return "cancel";
}

/** True once the pointer has moved clearly left, more sideways than up or down. */
export function horizontalIntent(dx: number, dy: number): boolean {
  return dx < -10 && Math.abs(dx) > Math.abs(dy) * 1.2;
}

/**
 * How visible the bin in the red reveal should be.
 * `offsetPx` is the row travel (negative is left). Fully in once the delete
 * strip has slid clear, and fully hidden at rest so it never doubles the strip.
 */
export function revealProgress(offsetPx: number, zonePx = 56): number {
  if (!(zonePx > 0)) return 0;
  const shown = -offsetPx / zonePx;
  if (shown <= 0) return 0;
  if (shown >= 1) return 1;
  return shown;
}
