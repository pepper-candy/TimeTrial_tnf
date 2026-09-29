import { describe, expect, it } from "vitest";
import { defaultFiveK } from "./course";
import { makeDemoEvent } from "./demo";
import { buildRunnerRaces } from "./race";
import { computeRunnerStats, halfSplitFor } from "./stats";
import type { EventState, Runner } from "./types";

function ev(partial: Partial<EventState> = {}): EventState {
  return {
    id: "e",
    code: "ZZZZZ",
    name: "S",
    createdAt: 0,
    status: "running",
    startedAt: 0,
    course: defaultFiveK(),
    runners: [
      { id: "a", bib: "1", name: "Ada", studentId: "1", category: "Girls", photoVer: null } satisfies Runner,
    ],
    taps: [],
    marks: [],
    edits: [],
    demo: false,
    demoAutoMark: false,
    demoPlan: null,
    demoSpeed: 1,
    pinHash: null,
    hideStudentIds: false,
    helperPin: null,
    resultKmSplits: [1, 3],
    endedAt: null,
    rev: 0,
    ...partial,
  };
}

describe("runner stats", () => {
  it("computes pace, speed, projection, and km splits", () => {
    // 200m in 40s, then 400m laps in 80s → 3:20/km. After 3 crossings: 1000m in 200s.
    const splits = [40_000, 80_000, 80_000];
    let t = 0;
    const taps = splits.map((ms, i) => {
      t += ms;
      return { id: `t${i}`, t };
    });
    const marks = splits.map((_, i) => ({ id: `m${i}`, bib: "1" }));
    const event = ev({ taps, marks });
    const races = buildRunnerRaces(event, t);
    const stats = computeRunnerStats(event, races[0], races[0]);
    expect(stats.avgPaceSecPerKm).toBeCloseTo(200, 6);
    expect(stats.speedKmh).toBeCloseTo(18, 6);
    expect(stats.kmSplits).toHaveLength(1);
    expect(stats.kmSplits[0].elapsedMs).toBe(200_000);
    expect(races[0].eta).toBeGreaterThan(t);
    expect(stats.projectedFinishMs).toBeCloseTo(1_000_000, -2);
    expect(stats.ignoredSplits).toBe(0);
  });

  it("drops laps under 20s per 400m from best, last, and speed", () => {
    // 200m in 40s and 400m in 80s are real (3:20/km). Then a 1s and a 4s mash.
    const splits = [40_000, 80_000, 1_000, 4_000];
    let t = 0;
    const taps = splits.map((ms, i) => {
      t += ms;
      return { id: `t${i}`, t };
    });
    const marks = splits.map((_, i) => ({ id: `m${i}`, bib: "1" }));
    const event = ev({ taps, marks });
    const races = buildRunnerRaces(event, t);
    const stats = computeRunnerStats(event, races[0], races[0]);
    expect(stats.ignoredSplits).toBe(2);
    expect(stats.fastestLapSec).toBeCloseTo(80, 6);
    expect(stats.slowestLapSec).toBeCloseTo(80, 6);
    expect(stats.lastLapPaceSecPerKm).toBeCloseTo(200, 6);
    expect(stats.avgPaceSecPerKm).toBeCloseTo(200, 6);
    expect(stats.speedKmh).toBeCloseTo(18, 6);
  });

  it("shows no lap record when every split is a test tap", () => {
    const splits = [2_000, 3_000, 4_000];
    let t = 0;
    const taps = splits.map((ms, i) => {
      t += ms;
      return { id: `t${i}`, t };
    });
    const marks = splits.map((_, i) => ({ id: `m${i}`, bib: "1" }));
    const event = ev({ taps, marks });
    const races = buildRunnerRaces(event, t);
    const stats = computeRunnerStats(event, races[0], races[0]);
    expect(stats.ignoredSplits).toBe(3);
    expect(stats.fastestLapSec).toBeNull();
    expect(stats.lastLapPaceSecPerKm).toBeNull();
    expect(stats.speedKmh).toBeNull();
    expect(stats.avgPaceSecPerKm).toBeNull();
  });

  it("keeps a 400m lap of exactly 20s", () => {
    const splits = [40_000, 20_000];
    let t = 0;
    const taps = splits.map((ms, i) => {
      t += ms;
      return { id: `t${i}`, t };
    });
    const marks = splits.map((_, i) => ({ id: `m${i}`, bib: "1" }));
    const event = ev({ taps, marks });
    const races = buildRunnerRaces(event, t);
    const stats = computeRunnerStats(event, races[0], races[0]);
    expect(stats.ignoredSplits).toBe(0);
    expect(stats.fastestLapSec).toBeCloseTo(20, 6);
    expect(stats.speedKmh).toBeGreaterThan(0);
  });

  it("omits a half split quicker than 20s per 400m", () => {
    const splits = [50_000, 90_000, 90_000, 1_000, 4_000];
    let t = 0;
    const taps = splits.map((ms, i) => {
      t += ms;
      return { id: `t${i}`, t };
    });
    const marks = splits.map((_, i) => ({ id: `m${i}`, bib: "1" }));
    const event = ev({ taps, marks });
    const races = buildRunnerRaces(event, t);
    expect(halfSplitFor(event, races[0])).toBeNull();
  });
});

describe("demo race", () => {
  it("seeds 18 runners with paired crossings after elapsed time", () => {
    const now = 1_700_000_000_000;
    const demo = makeDemoEvent(now, 18 * 60 * 1000, 1);
    expect(demo.runners).toHaveLength(18);
    expect(demo.status).toBe("running");
    expect(demo.taps.length).toBeGreaterThan(30);
    expect(demo.marks.length).toBe(demo.taps.length);
    expect(demo.runners.filter((r) => r.category === "Girls")).toHaveLength(2);
    const races = buildRunnerRaces(demo, now);
    expect(races.some((r) => r.finished || r.bell || r.lapDown > 0)).toBe(true);
    expect(races[0].crossings.length).toBeGreaterThan(races[races.length - 1].crossings.length);
  });
});
