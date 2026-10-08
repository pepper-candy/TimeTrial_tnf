import { describe, expect, it } from "vitest";
import {
  boardHighlights,
  boardRows,
  cellKey,
  formatCum,
  formatLapSplit,
  formatLapSplitBig,
  lapColumns,
  lapDownLabel,
} from "./board";
import { defaultFiveK } from "./course";
import { buildRunnerRaces } from "./race";
import type { EventState, Runner, Tap } from "./types";

const START = 1_000_000;

function runner(bib: string, category = "Boys"): Runner {
  return { id: `id-${bib}`, bib, name: `R${bib}`, studentId: "20" + bib, category, photoVer: null };
}

/** Taps + marks for runners whose cumulative crossing times are given (ms after start). */
function race(times: Record<string, number[]>, estimated: string[] = []) {
  const rows: { bib: string; t: number; id: string }[] = [];
  for (const [bib, xs] of Object.entries(times)) {
    xs.forEach((ms, i) => rows.push({ bib, t: START + ms, id: `${bib}-${i}` }));
  }
  rows.sort((a, b) => a.t - b.t);
  const taps: Tap[] = rows.map((r) => ({ id: `t-${r.id}`, t: r.t, estimated: estimated.includes(r.id) }));
  const marks = rows.map((r) => ({ id: `m-${r.id}`, bib: r.bib }));
  return { taps, marks };
}

function event(partial: Partial<EventState>): EventState {
  return {
    id: "e",
    code: "ABCDE",
    name: "5K",
    createdAt: 0,
    status: "running",
    ready: true,
    startedAt: START,
    endedAt: null,
    course: defaultFiveK(),
    runners: [],
    taps: [],
    marks: [],
    edits: [],
    demo: false,
    demoAutoMark: false,
    demoPlan: null,
    demoSpeed: 1,
    pinHash: null,
    helperPin: null,
    hideStudentIds: false,
    resultKmSplits: [1, 3],
    rev: 0,
    ...partial,
  };
}

describe("board columns", () => {
  it("numbers every crossing like frames and tags whole-km crossings", () => {
    const cols = lapColumns(defaultFiveK());
    expect(cols).toHaveLength(13);
    expect(cols[0]).toEqual({ n: 1, distanceM: 200, km: null });
    expect(cols[2].km).toBe(1);
    expect(cols[7].km).toBe(3);
    expect(cols[12]).toEqual({ n: 13, distanceM: 5000, km: 5 });
  });
});

describe("board highlights", () => {
  it("rings the race's fastest full lap and each runner's best, skipping the 200 m start", () => {
    const { taps, marks } = race({
      "1": [30_000, 100_000, 168_000, 240_000],
      "2": [35_000, 110_000, 185_000, 255_000],
    });
    const ev = event({ runners: [runner("1"), runner("2")], taps, marks });
    const h = boardHighlights(ev, buildRunnerRaces(ev));
    expect(h.raceBest).toEqual({ runnerId: "id-1", index: 2, ms: 68_000 });
    expect(h.personalBest.get("id-1")).toBe(2);
    expect(h.personalBest.get("id-2")).toBe(3);
  });

  it("does not ring a lap under 20s per 400m", () => {
    const { taps, marks } = race({ "1": [30_000, 35_000, 105_000] });
    const ev = event({ runners: [runner("1")], taps, marks });
    const h = boardHighlights(ev, buildRunnerRaces(ev));
    expect(h.raceBest).toEqual({ runnerId: "id-1", index: 2, ms: 70_000 });
    expect(h.personalBest.get("id-1")).toBe(2);
  });

  it("never picks an estimated split as a best lap", () => {
    const { taps, marks } = race({ "1": [30_000, 90_000, 170_000] }, ["1-1"]);
    const ev = event({ runners: [runner("1")], taps, marks });
    const h = boardHighlights(ev, buildRunnerRaces(ev));
    expect(h.raceBest).toBeNull();
    expect(h.personalBest.has("id-1")).toBe(false);
  });

  it("does not treat a live marker bib as an edit", () => {
    const { taps, marks } = race({ "1": [30_000, 100_000, 170_000] });
    const ev = event({
      runners: [runner("1")],
      taps,
      marks,
      edits: [0, 1, 2].map((i) => ({
        id: `e${i}`,
        at: 0,
        actor: "marker" as const,
        kind: "mark-insert" as const,
        markId: `m-1-${i}`,
      })),
    });
    const h = boardHighlights(ev, buildRunnerRaces(ev));
    expect(h.edited.size).toBe(0);
  });

  it("marks crossings whose tap or bib was edited", () => {
    const { taps, marks } = race({ "1": [30_000, 100_000, 170_000] });
    const ev = event({
      runners: [runner("1")],
      taps,
      marks,
      edits: [
        { id: "x", at: 0, actor: "admin", kind: "mark-reassign", markId: "m-1-1" },
        { id: "y", at: 0, actor: "timer", kind: "tap-restore", tapId: "t-1-2" },
      ],
    });
    const h = boardHighlights(ev, buildRunnerRaces(ev));
    expect(h.edited.has(cellKey("id-1", 0))).toBe(false);
    expect(h.edited.has(cellKey("id-1", 1))).toBe(true);
    expect(h.edited.has(cellKey("id-1", 2))).toBe(true);
  });

  it("flags an admin bib insert and a time edit, not the marker append beside them", () => {
    const { taps, marks } = race({ "1": [30_000, 100_000, 170_000] });
    const ev = event({
      runners: [runner("1")],
      taps,
      marks,
      edits: [
        { id: "a", at: 0, actor: "marker", kind: "mark-insert", markId: "m-1-0" },
        { id: "b", at: 0, actor: "admin", kind: "mark-insert", markId: "m-1-1" },
        { id: "c", at: 0, actor: "admin", kind: "tap-time", tapId: "t-1-2" },
      ],
    });
    const h = boardHighlights(ev, buildRunnerRaces(ev));
    expect(h.edited.has(cellKey("id-1", 0))).toBe(false);
    expect(h.edited.has(cellKey("id-1", 1))).toBe(true);
    expect(h.edited.has(cellKey("id-1", 2))).toBe(true);
  });
});

describe("board rows", () => {
  it("filters by Boys / Girls and re-ranks inside the filter; All keeps everyone", () => {
    const { taps, marks } = race({ "1": [30_000], "2": [31_000], "3": [32_000] });
    const ev = event({
      runners: [runner("1", "Boys"), runner("2", "Girls"), runner("3", "")],
      taps,
      marks,
    });
    const races = buildRunnerRaces(ev);
    expect(boardRows(races, "all").map((r) => r.runner.bib)).toEqual(["1", "2", "3"]);
    expect(boardRows(races, "Girls").map((r) => r.runner.bib)).toEqual(["2"]);
    expect(boardRows(races, "Boys").map((r) => r.runner.bib)).toEqual(["1"]);
  });
});

describe("board number formats", () => {
  it("keeps cells short and tabular", () => {
    expect(formatLapSplit(58_340)).toBe("58.3");
    expect(formatLapSplit(62_450)).toBe("1:02.4");
    expect(formatLapSplitBig(42_800)).toBe("42.8");
    expect(formatLapSplitBig(85_600)).toBe("1:25");
    expect(formatCum(280_900)).toBe("4:40");
    expect(formatCum(3_725_000)).toBe("1:02:05");
    expect(lapDownLabel(1)).toBe("−1 lap");
    expect(lapDownLabel(2)).toBe("−2 laps");
  });
});
