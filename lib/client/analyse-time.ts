/**
 * Finish Cam Analyse — video ↔ race-clock mapping.
 *
 * Finish-time formula (server clock is source of truth):
 *
 *   tapT     = recServerAt + videoMs
 *   finishMs = max(0, tapT − startedAt)
 *
 * where:
 *   - startedAt   = Starter bang server time (event.startedAt from POST /start)
 *   - recServerAt = wall/server ms when Finish Cam recording began
 *   - videoMs     = offset into the WebM (ms from recording start), e.g. scrubber currentTime
 *
 * Equivalent: finishMs = max(0, (recServerAt − startedAt) + videoMs)
 *
 * Soundtrack bang in the WebM never overrides this clock.
 * Manual Set / Accept always beats YOLO proposals (see canProposeLaneFinish).
 */

export type LaneFinishSource = "none" | "manual" | "yolo";

/**
 * Per-lane finish draft used by the Analyse scrubber.
 * Agent 3 (YOLO) may propose into empty/unlocked lanes only via applyLaneProposal.
 */
export type LaneFinishState = {
  lane: number;
  bib: string;
  runnerId: string;
  name: string;
  /** Elapsed ms after startedAt; null = unset (Board shows —). */
  finishMs: number | null;
  /** Absolute tap epoch (= startedAt + finishMs). */
  tapT: number | null;
  snapshotDataUrl: string | null;
  /** Video offset (ms) of the snapshot / set frame. */
  snapshotVideoMs: number | null;
  source: LaneFinishSource;
  /**
   * Locked after Accept (or explicit lock). YOLO must never overwrite.
   * Manual Edit clears lock so the official can Set again.
   */
  locked: boolean;
  accepted: boolean;
};

/** Map recording video offset → race elapsed ms + absolute tap epoch. */
export function finishTimeFromVideoMs(opts: {
  startedAt: number;
  recServerAt: number;
  videoMs: number;
}): { finishMs: number; tapT: number } {
  const { startedAt, recServerAt, videoMs } = opts;
  const tapT = Math.round(recServerAt + videoMs);
  const finishMs = Math.max(0, tapT - startedAt);
  return { finishMs, tapT };
}

/** Inverse: race elapsed ms → video offset (for seeking to an existing finish). */
export function videoMsFromFinishMs(opts: {
  startedAt: number;
  recServerAt: number;
  finishMs: number;
}): number {
  const { startedAt, recServerAt, finishMs } = opts;
  return Math.round(startedAt + finishMs - recServerAt);
}

/**
 * Agent 3 extension point: YOLO may fill only empty, unlocked lanes.
 * Never propose over Accepted / locked / manually Set drafts.
 */
export function canProposeLaneFinish(row: LaneFinishState): boolean {
  if (row.locked || row.accepted) return false;
  if (row.source === "manual") return false;
  return row.source === "none" || row.finishMs == null;
}

/**
 * Agent 3 extension point: merge a YOLO suggestion into lane state.
 * Returns the next row, or the unchanged row if the lane is protected.
 */
export function applyLaneProposal(
  row: LaneFinishState,
  proposal: {
    finishMs: number;
    tapT: number;
    snapshotDataUrl: string | null;
    snapshotVideoMs: number | null;
  },
): LaneFinishState {
  if (!canProposeLaneFinish(row)) return row;
  return {
    ...row,
    finishMs: proposal.finishMs,
    tapT: proposal.tapT,
    snapshotDataUrl: proposal.snapshotDataUrl,
    snapshotVideoMs: proposal.snapshotVideoMs,
    source: "yolo",
  };
}

/** Nominal frame step for scrubber ←/→ (~30 fps). */
export const FRAME_STEP_SEC = 1 / 30;
