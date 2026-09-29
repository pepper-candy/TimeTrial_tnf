import { describe, expect, it } from "vitest";
import { CATEGORIES, inCategory, normalizeCategory } from "./category";
import { makeDemoEvent } from "./demo";
import { hydrateEvent } from "./store";
import type { EventState } from "./types";

describe("categories", () => {
  it("are just Boys and Girls", () => {
    expect([...CATEGORIES]).toEqual(["Boys", "Girls"]);
  });

  it("maps common spellings and drops custom values to none", () => {
    expect(normalizeCategory("Boys")).toBe("Boys");
    expect(normalizeCategory(" girls ")).toBe("Girls");
    expect(normalizeCategory("Male")).toBe("Boys");
    expect(normalizeCategory("F")).toBe("Girls");
    expect(normalizeCategory("Open")).toBe("");
    expect(normalizeCategory("sssss")).toBe("");
    expect(normalizeCategory("")).toBe("");
    expect(normalizeCategory(undefined)).toBe("");
  });

  it("filters with All, Boys, Girls", () => {
    expect(inCategory("", "all")).toBe(true);
    expect(inCategory("Open", "all")).toBe(true);
    expect(inCategory("boys", "Boys")).toBe(true);
    expect(inCategory("", "Boys")).toBe(false);
    expect(inCategory("Girls", "Boys")).toBe(false);
  });
});

describe("category migration on load", () => {
  it("moves custom categories to none and drops the old custom list", () => {
    const base = makeDemoEvent();
    const stored = {
      ...base,
      categories: ["Girls", "Boys", "Open", "sssss"],
      runners: [
        { ...base.runners[0], category: "Open" },
        { ...base.runners[1], category: "sssss" },
        { ...base.runners[2], category: "boys" },
        { ...base.runners[3], category: "Girls" },
      ],
    } as unknown as EventState;
    const ev = hydrateEvent(stored);
    expect(ev.runners.map((r) => r.category)).toEqual(["", "", "Boys", "Girls"]);
    expect("categories" in ev).toBe(false);
  });
});
