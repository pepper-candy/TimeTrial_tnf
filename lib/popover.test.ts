import { describe, expect, it } from "vitest";
import { placePopover } from "./popover";

describe("placePopover", () => {
  it("opens below a top-bar button and right-aligns, clamped inside a phone viewport", () => {
    const box = placePopover({
      anchor: { top: 8, left: 274, width: 48, height: 48 },
      size: { width: 320, height: 280 },
      viewport: { width: 390, height: 844 },
    });
    expect(box.placement).toBe("below");
    expect(box.top).toBe(64);
    // Right edge of the anchor is 322; a 320px menu would start at 2, so it shifts in.
    expect(box.left).toBe(8);
    expect(box.left + Math.min(320, box.maxWidth)).toBeLessThanOrEqual(390 - 8);
    expect(box.top).toBeGreaterThanOrEqual(8);
    expect(box.maxHeight).toBeGreaterThanOrEqual(280);
  });

  it("never opens above the viewport when the anchor is the top bar", () => {
    const box = placePopover({
      anchor: { top: 8, left: 280, width: 48, height: 48 },
      size: { width: 340, height: 360 },
      viewport: { width: 390, height: 844 },
    });
    expect(box.placement).toBe("below");
    expect(box.top).toBeGreaterThanOrEqual(8);
    expect(box.top).toBe(64);
    expect(box.left).toBeGreaterThanOrEqual(8);
  });

  it("shifts left to clear the right edge", () => {
    const box = placePopover({
      anchor: { top: 100, left: 700, width: 48, height: 40 },
      size: { width: 200, height: 100 },
      viewport: { width: 800, height: 600 },
    });
    expect(box.left).toBe(548);
    expect(box.left + 200).toBeLessThanOrEqual(800 - 8);
    expect(box.placement).toBe("below");
  });

  it("shifts right when right-align would pass the left edge", () => {
    const box = placePopover({
      anchor: { top: 20, left: 10, width: 40, height: 40 },
      size: { width: 300, height: 80 },
      viewport: { width: 400, height: 800 },
    });
    expect(box.left).toBe(8);
    expect(box.placement).toBe("below");
  });

  it("flips above only when it does not fit below and there is more room above", () => {
    const box = placePopover({
      anchor: { top: 500, left: 200, width: 48, height: 40 },
      size: { width: 200, height: 200 },
      viewport: { width: 800, height: 600 },
    });
    expect(box.placement).toBe("above");
    expect(box.top).toBe(292);
    expect(box.top).toBeGreaterThanOrEqual(8);
    expect(box.top + Math.min(200, box.maxHeight)).toBeLessThanOrEqual(500 - 8);
  });

  it("stays below a tall menu when the anchor is near the top, and caps the height", () => {
    const box = placePopover({
      anchor: { top: 8, left: 300, width: 48, height: 48 },
      size: { width: 280, height: 900 },
      viewport: { width: 390, height: 700 },
    });
    expect(box.placement).toBe("below");
    expect(box.top).toBe(64);
    expect(box.maxHeight).toBe(700 - 8 - 64);
    expect(box.top + box.maxHeight).toBeLessThanOrEqual(700 - 8);
  });
});
