import { describe, expect, it } from "vitest";
import { deriveCourse } from "./course";
import { guessMissRunners } from "./miss-guess";
import type { EventState, Runner } from "./types";

function runner(bib: string): Runner {
  return { id: `id-${bib}`, bib, name: `R${bib}`, studentId: "20" + bib, category: "Boys", photoVer: null };
}

function ev(partial: Partial<EventState> = {}): EventState {
  return {
    id: "e1",
    code: "ABCDE",
    name: "Test",
    createdAt: 0,
    status: "running",
    ready: true,
    startedAt: 1_000_000,
    endedAt: null,
    course: deriveCourse({ totalDistanceM: 5000, lapLengthM: 400, targetPaceSecPerKm: 240 }),
    runners: [runner("10"), runner("20"), runner("30")],
    taps: [],
    marks: [],
    idles: [],
    groups: [],
    syncs: [],
    edits: [],
    demo: false,
    demoAutoMark: false,
    demoPlan: null,
    demoSpeed: 1,
    pinHash: null,
    hideStudentIds: false,
    helperPin: null,
    resultKmSplits: [1, 3],
    rev: 0,
    ...partial,
  };
}

describe("guessMissRunners", () => {
  it("ranks by expected arrival from last split vs the miss tap", () => {
    const start = 1_000_000;
    const event = ev({
      taps: [
        { id: "t1", t: start + 40_000 },
        { id: "t2", t: start + 41_000 },
        { id: "t3", t: start + 80_000 },
        { id: "t4", t: start + 82_000 },
        { id: "t5", t: start + 120_000 },
      ],
      marks: [
        { id: "m1", bib: "10" },
        { id: "m2", bib: "20" },
        { id: "m3", bib: "10" },
        { id: "m4", bib: "20" },
        { id: "m5", bib: "?" },
      ],
    });
    expect(guessMissRunners(event, "m5").map((r) => r.bib)).toEqual(["10", "20", "30"]);
  });

  it("returns fewer than three when the roster is smaller", () => {
    const event = ev({
      runners: [runner("10")],
      taps: [{ id: "t1", t: 1_040_000 }],
      marks: [{ id: "m1", bib: "?" }],
    });
    expect(guessMissRunners(event, "m1")).toHaveLength(1);
  });

  it("drops DNF runners after they dropped, but keeps them if the miss was earlier", () => {
    const start = 1_000_000;
    const base = ev({
      taps: [{ id: "t1", t: start + 120_000 }],
      marks: [{ id: "m1", bib: "?" }],
    });
    const after = {
      ...base,
      runners: base.runners.map((r) =>
        r.bib === "10" ? { ...r, dnfAt: start + 50_000 } : r,
      ),
    };
    expect(guessMissRunners(after, "m1").map((r) => r.bib)).toEqual(["20", "30"]);
    const before = {
      ...base,
      runners: base.runners.map((r) =>
        r.bib === "10" ? { ...r, dnfAt: start + 200_000 } : r,
      ),
    };
    expect(guessMissRunners(before, "m1").map((r) => r.bib)).toEqual(["10", "20", "30"]);
  });

  it("still ranks when the mark is a pending id with no pair", () => {
    const event = ev({
      taps: [{ id: "t1", t: 1_048_000 }],
      marks: [],
    });
    expect(guessMissRunners(event, "local-1").map((r) => r.bib)).toEqual(["10", "20", "30"]);
  });
});
