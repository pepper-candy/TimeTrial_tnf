import { describe, expect, it } from "vitest";
import {
  pressSeeds,
  singlePressEndVideoMs,
  singlePressWindow,
} from "./mark-mode";

describe("singlePressWindow", () => {
  it("returns ±buffer around the press, clamped at zero", () => {
    expect(singlePressWindow([400, 2000, 3200], 1)).toEqual({ in: 0, out: 900 });
    expect(singlePressWindow([400, 2000, 3200], 2)).toEqual({ in: 1500, out: 2500 });
    expect(singlePressWindow([400, 2000, 3200], 3, 250)).toEqual({ in: 2950, out: 3450 });
  });

  it("returns null for a lane with no press", () => {
    expect(singlePressWindow([400, 2000], 3)).toBeNull();
  });
});

describe("pressSeeds", () => {
  it("maps press order to lane order via the finish-time formula", () => {
    const seeds = pressSeeds({
      pressesMs: [1000, 2100],
      startedAt: 1_000_000,
      recServerAt: 1_001_000,
      laneCount: 4,
    });
    expect(seeds).toEqual([
      { lane: 1, finishMs: 2000, tapT: 1_002_000 },
      { lane: 2, finishMs: 3100, tapT: 1_003_100 },
    ]);
  });

  it("does not seed more lanes than there are presses", () => {
    const seeds = pressSeeds({
      pressesMs: [500],
      startedAt: 0,
      recServerAt: 0,
      laneCount: 8,
    });
    expect(seeds).toHaveLength(1);
    expect(seeds[0]!.lane).toBe(1);
  });

  it("skips non-finite press values", () => {
    const seeds = pressSeeds({
      pressesMs: [Number.NaN, 1200],
      startedAt: 1_000_000,
      recServerAt: 1_001_000,
      laneCount: 3,
    });
    expect(seeds).toEqual([{ lane: 2, finishMs: 2200, tapT: 1_002_200 }]);
  });
});

describe("singlePressEndVideoMs", () => {
  it("uses the last press", () => {
    expect(singlePressEndVideoMs([500, 1500], 999)).toBe(1500);
  });

  it("falls back when there are no presses", () => {
    expect(singlePressEndVideoMs([], 999)).toBe(999);
  });
});
