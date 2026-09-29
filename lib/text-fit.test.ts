import { describe, expect, it } from "vitest";
import { textFits } from "./text-fit";

describe("textFits", () => {
  it("accepts a name that fits and rejects one that would truncate", () => {
    expect(textFits(48, 80)).toBe(true);
    expect(textFits(120, 40)).toBe(false);
  });

  it("rejects a sliver of space so a stub never shows", () => {
    expect(textFits(8, 10)).toBe(false);
    expect(textFits(8, 0)).toBe(false);
  });
});
