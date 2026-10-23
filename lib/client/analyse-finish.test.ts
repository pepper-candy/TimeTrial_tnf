import { describe, expect, it } from "vitest";
import { laneFromY } from "./analyse-lanes";

describe("laneFromY", () => {
  it("maps top→bottom to lane 1→N", () => {
    expect(laneFromY(0.0, 4)).toBe(1);
    expect(laneFromY(0.24, 4)).toBe(1);
    expect(laneFromY(0.25, 4)).toBe(2);
    expect(laneFromY(0.99, 4)).toBe(4);
  });

  it("clamps a single lane", () => {
    expect(laneFromY(0.9, 1)).toBe(1);
  });
});
