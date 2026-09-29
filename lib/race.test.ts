import { describe, expect, it } from "vitest";
import { defaultFiveK } from "./course";
import {
  appendMark,
  appendTap,
  buildRunnerRaces,
  collectFlags,
  compareRank,
  deleteMark,
  insertMark,
  predictedTileOrder,
  reassignMark,
  swapMarks,
  unmatchedTaps,
  zipPairs,
} from "./race";
import type { EventState, Runner } from "./types";

function runner(bib: string, name = `R${bib}`): Runner {
  return { id: `id-${bib}`, bib, name, studentId: "20" + bib, category: "Boys", photoVer: null };
}

function event(partial: Partial<EventState> = {}): EventState {
  return {
    id: "e1",
    code: "ABCDE",
    name: "Test",
    createdAt: 0,
    status: "running",
    startedAt: 1_000_000,
    course: defaultFiveK(),
    runners: [runner("1"), runner("2"), runner("7")],
    taps: [],
    marks: [],
    edits: [],
    demo: false,
    demoAutoMark: false,
    demoPlan: null,
    demoSpeed: 1,
    pinHash: null,
    hideStudentIds: false,
    categories: ["Girls", "Boys"],
    resultKmSplits: [1, 3],
    endedAt: null,
    rev: 0,
    ...partial,
  };
}

describe("pairing", () => {
  it("pairs tap #n with mark #n in order", () => {
    let taps = appendTap([], { id: "t1", t: 10 });
    taps = appendTap(taps, { id: "t2", t: 20 });
    taps = appendTap(taps, { id: "t3", t: 30 });
    let marks = appendMark([], "1");
    marks = appendMark(marks, "7");
    const pairs = zipPairs(taps, marks);
    expect(pairs).toHaveLength(3);
    expect(pairs[0].tap?.id).toBe("t1");
    expect(pairs[0].mark?.bib).toBe("1");
    expect(pairs[1].mark?.bib).toBe("7");
    expect(pairs[2].mark).toBeNull();
    expect(unmatchedTaps(taps, marks)).toHaveLength(1);
  });

  it("is idempotent on tap ids", () => {
    const a = appendTap([], { id: "t1", t: 5 });
    const b = appendTap(a, { id: "t1", t: 99 });
    expect(b).toHaveLength(1);
    expect(b[0].t).toBe(5);
  });

  it("inserts, deletes, swaps, and reassigns marks", () => {
    let marks = appendMark([], "1");
    marks = appendMark(marks, "2");
    marks = appendMark(marks, "7");
    marks = insertMark(marks, 1, "99");
    expect(marks.map((m) => m.bib)).toEqual(["1", "99", "2", "7"]);
    marks = deleteMark(marks, 1);
    expect(marks.map((m) => m.bib)).toEqual(["1", "2", "7"]);
    marks = swapMarks(marks, 0, 2);
    expect(marks.map((m) => m.bib)).toEqual(["7", "2", "1"]);
    marks = reassignMark(marks, 1, "3");
    expect(marks.map((m) => m.bib)).toEqual(["7", "3", "1"]);
  });
});

describe("ranking and lapped runners", () => {
  it("sorts by crossings desc then last time asc, and tags -N laps", () => {
    const ev = event({
      taps: [
        { id: "a", t: 1_000_080_000 },
        { id: "b", t: 1_000_090_000 },
        { id: "c", t: 1_000_160_000 },
        { id: "d", t: 1_000_200_000 },
        { id: "e", t: 1_000_240_000 },
      ],
      marks: [
        { id: "m1", bib: "1" },
        { id: "m2", bib: "2" },
        { id: "m3", bib: "1" },
        { id: "m4", bib: "1" },
        { id: "m5", bib: "2" },
      ],
    });
    const races = buildRunnerRaces(ev, 1_000_300_000);
    expect(races[0].runner.bib).toBe("1");
    expect(races[0].crossings).toHaveLength(3);
    expect(races[1].runner.bib).toBe("2");
    expect(races[1].crossings).toHaveLength(2);
    expect(races[1].lapDown).toBe(1);
    expect(races[2].runner.bib).toBe("7");
    expect(races[2].lapDown).toBe(3);
  });

  it("keeps equal-crossing order by earlier last time", () => {
    const a = {
      crossings: { length: 4 },
      lastEpoch: 50,
      runner: { bib: "9" },
    } as never;
    const b = {
      crossings: { length: 4 },
      lastEpoch: 40,
      runner: { bib: "2" },
    } as never;
    expect(compareRank(b, a)).toBeLessThan(0);
  });
});

describe("predicted next arrival", () => {
  it("queues a slower lapped runner behind a faster one even if they last appeared later", () => {
    const ev = event({
      startedAt: 0,
      taps: [
        { id: "t1", t: 200_000 },
        { id: "t2", t: 400_000 },
        { id: "t3", t: 410_000 },
        { id: "t4", t: 600_000 },
      ],
      marks: [
        { id: "m1", bib: "1" },
        { id: "m2", bib: "1" },
        { id: "m3", bib: "2" },
        { id: "m4", bib: "1" },
      ],
    });
    const races = buildRunnerRaces(ev, 610_000);
    const tiles = predictedTileOrder(races);
    expect(tiles[0].runner.bib).toBe("1");
    expect(tiles[1].runner.bib).toBe("2");
    expect(tiles[0].eta).toBeLessThan(tiles[1].eta!);
  });
});

describe("flags", () => {
  it("does not let extra crossings leapfrog a faster finisher", () => {
    const ev = event({
      taps: [
        { id: "a", t: 1_000_800_000 },
        { id: "b", t: 1_001_000_000 },
        { id: "c", t: 1_001_010_000 },
      ],
      marks: [
        { id: "m1", bib: "1" },
        { id: "m2", bib: "2" },
        { id: "m3", bib: "2" },
      ],
      course: { ...defaultFiveK(), requiredCrossings: 1, totalDistanceM: 200, firstPartialM: 200 },
    });
    const races = buildRunnerRaces(ev, 1_002_000_000);
    expect(races[0].runner.bib).toBe("1");
    expect(races[0].finished).toBe(true);
    expect(races[1].flags.some((f) => f.kind === "over-count")).toBe(true);
  });

  it("flags a same-runner double within a physically impossible split", () => {
    const ev = event({
      taps: [
        { id: "t1", t: 1_000_010_000 },
        { id: "t2", t: 1_000_010_500 },
      ],
      marks: [
        { id: "m1", bib: "1" },
        { id: "m2", bib: "1" },
      ],
    });
    const races = buildRunnerRaces(ev, 1_000_020_000);
    const r1 = races.find((r) => r.runner.bib === "1")!;
    expect(r1.flags.some((f) => f.kind === "too-fast")).toBe(true);
  });

  it("flags tap/mark count lag beyond the normal 2-body delay, not a healthy trail", () => {
    const ok = event({
      taps: [
        { id: "a", t: 10 },
        { id: "b", t: 20 },
        { id: "c", t: 30 },
      ],
      marks: [{ id: "m1", bib: "1" }],
    });
    const racesOk = buildRunnerRaces(ok);
    expect(collectFlags(ok, racesOk).some((f) => f.kind === "count-lag")).toBe(false);

    const bad = event({
      taps: [
        { id: "a", t: 10 },
        { id: "b", t: 20 },
        { id: "c", t: 30 },
        { id: "d", t: 40 },
        { id: "e", t: 50 },
      ],
      marks: [{ id: "m1", bib: "1" }],
    });
    const racesBad = buildRunnerRaces(bad);
    const lag = collectFlags(bad, racesBad).find((f) => f.kind === "count-lag");
    expect(lag?.detail).toBe("5 taps · 1 marks");
  });
});
