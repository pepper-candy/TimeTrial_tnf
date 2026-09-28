import { describe, expect, it } from "vitest";
import { faceCropRect, photoKey, photoPath } from "./photo";

describe("photo helpers", () => {
  it("center-crops a landscape frame with a slight upward bias", () => {
    const r = faceCropRect(800, 400);
    expect(r.side).toBe(400);
    expect(r.sx).toBe(200);
    expect(r.sy).toBeLessThan(80);
  });

  it("does not place the crop above the top of a tall portrait", () => {
    const r = faceCropRect(400, 1200);
    expect(r.side).toBe(400);
    expect(r.sx).toBe(0);
    expect(r.sy).toBeGreaterThan(0);
    expect(r.sy + r.side).toBeLessThanOrEqual(1200);
  });

  it("builds a cache-busted photo URL without embedding bytes", () => {
    expect(photoPath("evt", "run", "abc")).toBe("/api/photo/evt/run?v=abc");
    expect(photoKey("evt", "run")).toBe("tt:photo:evt:run");
  });
});
