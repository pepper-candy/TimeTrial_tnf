import { describe, expect, it } from "vitest";
import { defaultFiveK } from "./course";
import { makeDemoEvent } from "./demo";
import { advanceDemo, raceNow } from "./demo-run";
import { buildRunnerRaces } from "./race";
import type { EventState } from "./types";

function base(partial: Partial<EventState> = {}): EventState {
  return {
    id: "e",
    code: "AAAAA",
    name: "5000m TT",
    createdAt: 0,
    status: "running",
    startedAt: 1_000,
    endedAt: null,
    course: defaultFiveK(),
    runners: [],
    taps: [],
    marks: [],
    edits: [],
    demo: true,
    demoAutoMark: true,
    demoPlan: null,
    demoSpeed: 10,
    pinHash: null,
    hideStudentIds: false,
    helperPin: null,
    resultKmSplits: [1, 3],
    rev: 0,
    ...partial,
  };
}

describe("demo clock", () => {
  it("scales elapsed by demoSpeed", () => {
    expect(raceNow(base({ demoSpeed: 10 }), 2_000)).toBe(11_000);
    expect(raceNow(base({ demoSpeed: 1 }), 2_000)).toBe(2_000);
  });

  it("freezes at endedAt after End race", () => {
    const ev = base({ status: "finished", endedAt: 1_500, demoSpeed: 10 });
    expect(raceNow(ev, 99_000)).toBe(6_000);
    expect(raceNow(ev, 1_500)).toBe(6_000);
  });

  it("does not scale a live (non-demo) race", () => {
    expect(raceNow(base({ demo: false, demoSpeed: 10 }), 2_000)).toBe(2_000);
  });
});

describe("demo seed playback", () => {
  it("plays from the gun at 10x so a 17'43 finisher is done after ~106s wall", () => {
    const start = 2_000_000_000_000;
    const demo = makeDemoEvent(start, 0, 10);
    expect(demo.demoSpeed).toBe(10);
    expect(demo.taps).toHaveLength(0);

    const wall = start + 106_300;
    const live = advanceDemo(demo, raceNow(demo, wall));
    const races = buildRunnerRaces(live);
    const first = races.find((r) => r.runner.bib === "1")!;
    expect(first.finished).toBe(true);
    expect(first.finishMs).toBe(1_063_000);

    const girl = races.find((r) => r.runner.bib === "15")!;
    expect(girl.finished).toBe(false);
    expect(girl.crossings.length).toBeGreaterThan(0);
  });

  it("stops adding crossings after End race", () => {
    const start = 2_000_000_000_000;
    const demo = makeDemoEvent(start, 0, 10);
    const wallEnd = start + 60_000;
    const frozen: EventState = {
      ...demo,
      status: "finished",
      endedAt: wallEnd,
    };
    const later = advanceDemo(frozen, raceNow(frozen, wallEnd + 600_000));
    const races = buildRunnerRaces(later);
    const first = races.find((r) => r.runner.bib === "1")!;
    expect(first.finished).toBe(false);
    const again = advanceDemo(later, raceNow(frozen, wallEnd + 1_200_000));
    expect(again.taps.length).toBe(later.taps.length);
  });
});
