import { describe, expect, it } from "vitest";
import {
  createLaneGuides,
  defaultBoundaries,
  feetPointFromBox,
  mapFeetToLane,
  moveBoundary,
  pointInLane,
  applyPreset,
} from "./lane-guides";

describe("defaultBoundaries", () => {
  it("head-on uses equal splits", () => {
    expect(defaultBoundaries(4, "head-on")).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });

  it("side-on tapers — bottom (near) larger than top (far)", () => {
    const b = defaultBoundaries(4, "side-on");
    expect(b[0]).toBe(0);
    expect(b[4]).toBe(1);
    const heights = [1, 2, 3, 4].map((i) => b[i]! - b[i - 1]!);
    // lane 1 (top) thinnest, lane 4 (bottom) tallest
    expect(heights[0]!).toBeLessThan(heights[1]!);
    expect(heights[1]!).toBeLessThan(heights[2]!);
    expect(heights[2]!).toBeLessThan(heights[3]!);
    // not equal-split
    expect(heights.every((h) => Math.abs(h - 0.25) < 1e-9)).toBe(false);
  });
});

describe("mapFeetToLane / pointInLane", () => {
  it("maps feet Y into side-on bands", () => {
    const guides = createLaneGuides(4, "side-on");
    const midLane1 = (guides.boundaries[0]! + guides.boundaries[1]!) / 2;
    const midLane4 = (guides.boundaries[3]! + guides.boundaries[4]!) / 2;
    expect(mapFeetToLane({ x: 0.5, y: midLane1 }, guides)).toBe(1);
    expect(mapFeetToLane({ x: 0.5, y: midLane4 }, guides)).toBe(4);
    expect(pointInLane({ x: 0.5, y: midLane1 }, guides, 1)).toBe(true);
    expect(pointInLane({ x: 0.5, y: midLane1 }, guides, 2)).toBe(false);
  });

  it("maps feet X into head-on bands", () => {
    const guides = createLaneGuides(3, "head-on");
    expect(mapFeetToLane({ x: 0.1, y: 0.9 }, guides)).toBe(1);
    expect(mapFeetToLane({ x: 0.5, y: 0.9 }, guides)).toBe(2);
    expect(mapFeetToLane({ x: 0.9, y: 0.9 }, guides)).toBe(3);
  });

  it("feetPointFromBox uses bottom-centre", () => {
    const p = feetPointFromBox({ x1: 0.2, y1: 0.1, x2: 0.4, y2: 0.8 });
    expect(p.x).toBeCloseTo(0.3, 10);
    expect(p.y).toBe(0.8);
  });
});

describe("moveBoundary / applyPreset", () => {
  it("drags an interior cut without crossing neighbours", () => {
    const g = createLaneGuides(3, "head-on");
    const moved = moveBoundary(g, 1, 0.4);
    expect(moved.boundaries[1]).toBeCloseTo(0.4, 5);
    expect(moved.boundaries[0]).toBe(0);
    expect(moved.boundaries[3]).toBe(1);
  });

  it("preset toggle rebuilds defaults", () => {
    const side = createLaneGuides(4, "side-on");
    const head = applyPreset(side, "head-on");
    expect(head.preset).toBe("head-on");
    expect(head.boundaries).toEqual(defaultBoundaries(4, "head-on"));
  });
});
