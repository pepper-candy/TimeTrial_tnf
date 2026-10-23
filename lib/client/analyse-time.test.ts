import { describe, expect, it } from "vitest";
import {
  applyLaneProposal,
  canProposeLaneFinish,
  finishTimeFromVideoMs,
  videoMsFromFinishMs,
  type LaneFinishState,
} from "./analyse-time";

function row(partial: Partial<LaneFinishState> = {}): LaneFinishState {
  return {
    lane: 1,
    bib: "1",
    runnerId: "r1",
    name: "Ada",
    finishMs: null,
    tapT: null,
    snapshotDataUrl: null,
    snapshotVideoMs: null,
    source: "none",
    locked: false,
    accepted: false,
    ...partial,
  };
}

describe("finishTimeFromVideoMs", () => {
  it("maps video offset via recServerAt to race elapsed", () => {
    // Recording began 2s after bang; athlete crosses 5s into the WebM → 7s race time
    const startedAt = 1_000_000;
    const recServerAt = 1_002_000;
    const { finishMs, tapT } = finishTimeFromVideoMs({
      startedAt,
      recServerAt,
      videoMs: 5_000,
    });
    expect(tapT).toBe(1_007_000);
    expect(finishMs).toBe(7_000);
  });

  it("clamps negative elapsed when video is before bang", () => {
    const { finishMs } = finishTimeFromVideoMs({
      startedAt: 1_010_000,
      recServerAt: 1_000_000,
      videoMs: 0,
    });
    expect(finishMs).toBe(0);
  });

  it("round-trips with videoMsFromFinishMs", () => {
    const startedAt = 5_000;
    const recServerAt = 5_500;
    const videoMs = 3_250;
    const { finishMs } = finishTimeFromVideoMs({ startedAt, recServerAt, videoMs });
    expect(videoMsFromFinishMs({ startedAt, recServerAt, finishMs })).toBe(videoMs);
  });

  it("an earlier corrected bang lengthens the finish by the correction", () => {
    // POST arrived late, so an uncorrected server start was 700ms too late.
    const recServerAt = 1_002_000;
    const videoMs = 5_000;
    const uncorrected = finishTimeFromVideoMs({
      startedAt: 1_000_700,
      recServerAt,
      videoMs,
    });
    // Starter now stamps the bang itself → startedAt moves earlier, not later.
    const corrected = finishTimeFromVideoMs({
      startedAt: 1_000_000,
      recServerAt,
      videoMs,
    });
    expect(corrected.finishMs - uncorrected.finishMs).toBe(700);
    expect(corrected.tapT).toBe(uncorrected.tapT);
  });
});

describe("canProposeLaneFinish / applyLaneProposal", () => {
  it("allows YOLO only on empty unlocked lanes", () => {
    expect(canProposeLaneFinish(row())).toBe(true);
    expect(canProposeLaneFinish(row({ source: "manual", finishMs: 1000 }))).toBe(false);
    expect(canProposeLaneFinish(row({ accepted: true, locked: true, finishMs: 1000 }))).toBe(
      false,
    );
  });

  it("applyLaneProposal skips locked / manual rows", () => {
    const locked = row({ locked: true, accepted: true, finishMs: 900, source: "manual" });
    const next = applyLaneProposal(locked, {
      finishMs: 800,
      tapT: 100_800,
      snapshotDataUrl: "data:x",
      snapshotVideoMs: 100,
    });
    expect(next.finishMs).toBe(900);
    expect(next.source).toBe("manual");

    const empty = row();
    const proposed = applyLaneProposal(empty, {
      finishMs: 800,
      tapT: 100_800,
      snapshotDataUrl: "data:x",
      snapshotVideoMs: 100,
    });
    expect(proposed.source).toBe("yolo");
    expect(proposed.finishMs).toBe(800);
  });
});
