import { describe, expect, it } from "vitest";
import { applyTimeKey, recordCounts, recordRows, stopwatchDigitsToMs, timePrompt } from "./records";
import type { EventState } from "./types";

function base(): Pick<EventState, "startedAt" | "taps" | "marks"> {
  return { startedAt: 1_000_000, taps: [], marks: [] };
}

describe("record rows", () => {
  it("pairs tap n with bib n and puts the split beside the cumulative", () => {
    const rows = recordRows({
      ...base(),
      taps: [
        { id: "a", t: 1_001_080 },
        { id: "b", t: 1_006_170 },
      ],
      marks: [
        { id: "m1", bib: "7" },
        { id: "m2", bib: "12" },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      index: 0,
      elapsedMs: 1080,
      splitMs: 1080,
      mark: { bib: "7" },
    });
    expect(rows[1]).toMatchObject({
      index: 1,
      elapsedMs: 6170,
      splitMs: 5090,
      mark: { bib: "12" },
    });
  });

  it("leaves an empty tap or bib slot when the counts differ", () => {
    const extraTap = recordRows({
      ...base(),
      taps: [
        { id: "a", t: 1_001_000 },
        { id: "b", t: 1_002_000 },
      ],
      marks: [{ id: "m1", bib: "3" }],
    });
    expect(extraTap[1].tap?.id).toBe("b");
    expect(extraTap[1].mark).toBeNull();
    expect(extraTap[1].splitMs).toBe(1000);

    const extraBib = recordRows({
      ...base(),
      taps: [{ id: "a", t: 1_004_000 }],
      marks: [
        { id: "m1", bib: "3" },
        { id: "m2", bib: "9" },
      ],
    });
    expect(extraBib[1].tap).toBeNull();
    expect(extraBib[1].mark?.bib).toBe("9");
    expect(extraBib[1].elapsedMs).toBeNull();
  });

  it("skips soft-deleted taps and bibs and warns when the live counts differ", () => {
    const event = {
      taps: [
        { id: "a", t: 1 },
        { id: "b", t: 2, deletedAt: 9 },
      ],
      marks: [{ id: "m1", bib: "1" }],
    };
    expect(recordCounts(event.taps, event.marks)).toEqual({ taps: 1, bibs: 1, differ: false });
    expect(recordRows({ startedAt: 0, ...event })).toHaveLength(1);
    expect(recordCounts([{ id: "a", t: 1 }], [])).toEqual({ taps: 1, bibs: 0, differ: true });
  });
});

describe("tap time pad", () => {
  it("formats a partial stopwatch and submits six digits", () => {
    expect(timePrompt("")).toBe("__:__.__");
    expect(timePrompt("1")).toBe("1_:__.__");
    expect(timePrompt("1234")).toBe("12:34.__");
    expect(stopwatchDigitsToMs("012345")).toBe(83_450);
    let typed = "";
    for (const key of ["0", "1", "2", "3", "4"]) {
      typed = applyTimeKey(typed, key).typed;
    }
    const done = applyTimeKey(typed, "5");
    expect(done.submitMs).toBe(83_450);
    expect(done.typed).toBe("");
  });

  it("refuses seconds above 59 and never submits on backspace or clear", () => {
    expect(applyTimeKey("016", "0")).toEqual({ typed: "016", submitMs: null });
    expect(applyTimeKey("0159", "back")).toEqual({ typed: "015", submitMs: null });
    expect(applyTimeKey("0159", "clear")).toEqual({ typed: "", submitMs: null });
    expect(stopwatchDigitsToMs("016099")).toBeNull();
  });
});
