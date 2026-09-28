import { describe, expect, it } from "vitest";
import {
  faceCropRect,
  fitLongestSide,
  keepOriginalFull,
  photoKey,
  photoKeyLegacy,
  photoPath,
  FULL_MAX_BYTES,
} from "./photo";

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

  it("builds cache-busted thumb and full URLs without embedding bytes", () => {
    expect(photoPath("evt", "run", "abc")).toBe("/api/photo/evt/run?v=abc");
    expect(photoPath("evt", "run", "abc", "full")).toBe("/api/photo/evt/run?v=abc&s=full");
    expect(photoKey("evt", "run")).toBe("tt:photo:evt:run:thumb");
    expect(photoKey("evt", "run", "full")).toBe("tt:photo:evt:run:full");
    expect(photoKeyLegacy("evt", "run")).toBe("tt:photo:evt:run");
  });

  it("fits the longest side to 2560 without upscaling", () => {
    expect(fitLongestSide(4000, 2000)).toEqual({ width: 2560, height: 1280 });
    expect(fitLongestSide(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitLongestSide(1000, 4000).height).toBe(2560);
  });

  it("keeps a small jpeg/webp/png as the full original and rejects bigger or exotic types", () => {
    expect(keepOriginalFull(800_000, "image/jpeg")).toBe(true);
    expect(keepOriginalFull(FULL_MAX_BYTES, "image/webp")).toBe(true);
    expect(keepOriginalFull(FULL_MAX_BYTES + 1, "image/jpeg")).toBe(false);
    expect(keepOriginalFull(100_000, "image/heic")).toBe(false);
  });
});
