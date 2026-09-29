import { describe, expect, it } from "vitest";
import {
  crossingDistance,
  defaultFiveK,
  deriveCourse,
  kmCrossings,
  lapsCount,
  splitDistance,
} from "./course";

describe("course geometry", () => {
  it("defaults to 5000 m on a 400 m track: 12.5 laps, 200 m start, 13 crossings", () => {
    const c = defaultFiveK();
    expect(c.totalDistanceM).toBe(5000);
    expect(c.lapLengthM).toBe(400);
    expect(c.firstPartialM).toBe(200);
    expect(c.requiredCrossings).toBe(13);
    expect(lapsCount(c)).toBe(12.5);
    expect(crossingDistance(c, 1)).toBe(200);
    expect(crossingDistance(c, 2)).toBe(600);
    expect(crossingDistance(c, 13)).toBe(5000);
    expect(splitDistance(c, 1)).toBe(200);
    expect(splitDistance(c, 2)).toBe(400);
    expect(splitDistance(c, 13)).toBe(400);
    expect(kmCrossings(c)).toEqual([
      { km: 1, index: 3 },
      { km: 3, index: 8 },
      { km: 5, index: 13 },
    ]);
  });

  it("computes 1500 / 3000 / 10000 track presets", () => {
    const m1500 = deriveCourse({ totalDistanceM: 1500, lapLengthM: 400 });
    expect(m1500.firstPartialM).toBe(300);
    expect(m1500.requiredCrossings).toBe(4);
    expect(lapsCount(m1500)).toBe(3.75);

    const m3000 = deriveCourse({ totalDistanceM: 3000, lapLengthM: 400 });
    expect(m3000.firstPartialM).toBe(200);
    expect(m3000.requiredCrossings).toBe(8);
    expect(lapsCount(m3000)).toBe(7.5);

    const m10k = deriveCourse({ totalDistanceM: 10000, lapLengthM: 400 });
    expect(m10k.firstPartialM).toBe(0);
    expect(m10k.requiredCrossings).toBe(25);
    expect(lapsCount(m10k)).toBe(25);
  });

  it("honors custom lap length and start offset", () => {
    const road = deriveCourse({
      totalDistanceM: 5000,
      lapLengthM: 1000,
      firstPartialM: 0,
    });
    expect(road.requiredCrossings).toBe(5);
    expect(crossingDistance(road, 1)).toBe(1000);

    const offset = deriveCourse({
      totalDistanceM: 8000,
      lapLengthM: 500,
      startOffsetM: 250,
    });
    expect(offset.firstPartialM).toBe(250);
    expect(offset.requiredCrossings).toBe(17);
  });

  it("builds distance from a fixed crossing count", () => {
    const c = deriveCourse({ lapLengthM: 400, firstPartialM: 200, fixedCrossings: 13 });
    expect(c.totalDistanceM).toBe(5000);
    expect(c.requiredCrossings).toBe(13);
  });
});
