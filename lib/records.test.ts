import { describe, expect, it } from "vitest";
import { defaultFiveK } from "./course";
import {
  RECORD_TAG_LABEL,
  applyTimeKey,
  recordCounts,
  recordRowTags,
  recordRows,
  stopwatchDigitsToMs,
  timePrompt,
} from "./records";
import type { EditLogEntry, EventState, Runner } from "./types";

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

function runner(bib: string): Runner {
  return { id: `id-${bib}`, bib, name: bib, studentId: "", category: "Boys", photoVer: null };
}

function tagged(partial: Partial<EventState>) {
  const event = {
    runners: [runner("1"), runner("2")],
    course: defaultFiveK(),
    edits: [] as EditLogEntry[],
    startedAt: 1_000_000,
    taps: [],
    marks: [],
    ...partial,
  };
  const rows = recordRows(event);
  return recordRowTags(event, rows);
}

describe("record tags", () => {
  it("uses one- or two-word labels", () => {
    for (const label of Object.values(RECORD_TAG_LABEL)) {
      expect(label.split(" ").length).toBeLessThanOrEqual(2);
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("tags a missing tap, a missing bib, and a bib that is not on the roster", () => {
    const tags = tagged({
      taps: [
        { id: "a", t: 1_040_000 },
        { id: "b", t: 1_140_000 },
      ],
      marks: [
        { id: "m1", bib: "1" },
        { id: "m2", bib: "99" },
        { id: "m3", bib: "2" },
      ],
    });
    expect(tags[0]).toEqual([]);
    expect(tags[1]).toEqual(["unknown-bib"]);
    expect(tags[2]).toEqual(["no-tap"]);
    const extraTap = tagged({
      taps: [
        { id: "a", t: 1_040_000 },
        { id: "b", t: 1_140_000 },
      ],
      marks: [{ id: "m1", bib: "1" }],
    });
    expect(extraTap[1]).toEqual(["no-bib"]);
  });

  it("tags a repeated bib inside an impossible gap, and not a merely quick lap", () => {
    const tags = tagged({
      taps: [
        { id: "a", t: 1_040_000 },
        { id: "b", t: 1_042_000 },
      ],
      marks: [
        { id: "m1", bib: "1" },
        { id: "m2", bib: "1" },
      ],
    });
    expect(tags[1]).toEqual(["duplicate"]);
  });

  it("tags a lap that is far quicker or slower than that runner's recent pace", () => {
    const fast = tagged({
      taps: [
        { id: "a", t: 1_040_000 },
        { id: "b", t: 1_160_000 },
        { id: "c", t: 1_230_000 },
      ],
      marks: [
        { id: "m1", bib: "1" },
        { id: "m2", bib: "1" },
        { id: "m3", bib: "1" },
      ],
    });
    expect(fast[0]).toEqual([]);
    expect(fast[1]).toEqual([]);
    expect(fast[2]).toEqual(["too-fast"]);

    const slow = tagged({
      taps: [
        { id: "a", t: 1_040_000 },
        { id: "b", t: 1_120_000 },
        { id: "c", t: 1_280_000 },
      ],
      marks: [
        { id: "m1", bib: "1" },
        { id: "m2", bib: "1" },
        { id: "m3", bib: "1" },
      ],
    });
    expect(slow[2]).toEqual(["too-slow"]);
  });

  it("leaves an even pace untagged", () => {
    const tags = tagged({
      taps: [
        { id: "a", t: 1_040_000 },
        { id: "b", t: 1_130_000 },
        { id: "c", t: 1_222_000 },
        { id: "d", t: 1_313_000 },
      ],
      marks: [
        { id: "m1", bib: "1" },
        { id: "m2", bib: "1" },
        { id: "m3", bib: "1" },
        { id: "m4", bib: "1" },
      ],
    });
    expect(tags.every((row) => row.length === 0)).toBe(true);
  });

  it("tags a corrected tap or bib, and not a bib the marker just appended", () => {
    const estimated = tagged({
      taps: [{ id: "a", t: 1_040_000, estimated: true }],
      marks: [{ id: "m1", bib: "1" }],
    });
    expect(estimated[0]).toEqual(["edited"]);

    const reassigned = tagged({
      taps: [{ id: "a", t: 1_040_000 }],
      marks: [{ id: "m1", bib: "1" }],
      edits: [{ id: "e1", at: 1, actor: "admin", kind: "mark-reassign", markId: "m1", bib: "1", prevBib: "2" }],
    });
    expect(reassigned[0]).toEqual(["edited"]);

    const appended = tagged({
      taps: [{ id: "a", t: 1_040_000 }],
      marks: [{ id: "m1", bib: "1" }],
      edits: [{ id: "e1", at: 1, actor: "marker", kind: "mark-insert", markId: "m1", bib: "1" }],
    });
    expect(appended[0]).toEqual([]);
  });
});
