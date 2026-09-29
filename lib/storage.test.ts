import { describe, expect, it } from "vitest";
import { applyStorageDelta, formatStorage, storageRatio, STORAGE_CAP_BYTES } from "./storage";

describe("storage meter", () => {
  it("clamps a running counter at zero", () => {
    expect(applyStorageDelta(100, 40)).toBe(140);
    expect(applyStorageDelta(50, -80)).toBe(0);
    expect(applyStorageDelta(Number.NaN, 10)).toBe(10);
  });

  it("formats bytes against the 256 MB free tier", () => {
    expect(formatStorage(0)).toBe("0 B");
    expect(formatStorage(512)).toBe("512 B");
    expect(formatStorage(10 * 1024)).toBe("10.0 KB");
    expect(formatStorage(12.4 * 1024 * 1024)).toBe("12.4 MB");
    expect(STORAGE_CAP_BYTES).toBe(256 * 1024 * 1024);
    expect(storageRatio(128 * 1024 * 1024)).toBeCloseTo(0.5);
    expect(storageRatio(STORAGE_CAP_BYTES * 3)).toBe(1);
  });
});
