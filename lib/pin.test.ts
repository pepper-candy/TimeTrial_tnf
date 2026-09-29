import { describe, expect, it } from "vitest";
import { hashPin, verifyPin } from "./pin";

describe("helper PIN", () => {
  it("hashes consistently and rejects a wrong PIN", () => {
    const hash = hashPin("1234");
    expect(hash).toHaveLength(64);
    expect(verifyPin("1234", hash)).toBe(true);
    expect(verifyPin("1234 ", hash)).toBe(true);
    expect(verifyPin("0000", hash)).toBe(false);
    expect(verifyPin("", hash)).toBe(false);
  });

  it("allows writes when no PIN is set", () => {
    expect(verifyPin("", null)).toBe(true);
    expect(verifyPin("anything", undefined)).toBe(true);
  });
});
