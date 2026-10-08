import { describe, expect, it } from "vitest";
import { defaultFiveK } from "./course";
import { applyEdit, estimateMissedTapTime, liveIndexOfTap } from "./edits";
import { formatEst } from "./format";
import { buildRunnerRaces, liveMarks, liveTaps, unmatchedTaps } from "./race";
import { computeRunnerStats, fastestSlowestLap, fullLapsFor } from "./stats";
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
    course: defaultFiveK(),
    runners: [runner("1"), runner("2")],
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

describe("helper forgiveness", () => {
  it("soft-deletes a tap so pairing skips it, and restore puts it back", () => {
    let event = ev({
      taps: [
        { id: "a", t: 1_000_100 },
        { id: "b", t: 1_000_200 },
        { id: "c", t: 1_000_300 },
      ],
      marks: [
        { id: "m1", bib: "1" },
        { id: "m2", bib: "2" },
      ],
    });
    expect(unmatchedTaps(event.taps, event.marks)).toHaveLength(1);
    event = applyEdit(event, { action: "tap-delete", id: "c", actor: "timer" }, 50);
    expect(liveTaps(event.taps)).toHaveLength(2);
    expect(unmatchedTaps(event.taps, event.marks)).toHaveLength(0);
    expect(event.taps.find((t) => t.id === "c")?.deletedAt).toBe(50);
    expect(event.edits[0]).toMatchObject({ actor: "timer", kind: "tap-delete", tapId: "c" });
    event = applyEdit(event, { action: "tap-restore", id: "c", actor: "timer" }, 51);
    expect(liveTaps(event.taps)).toHaveLength(3);
    expect(unmatchedTaps(event.taps, event.marks)).toHaveLength(1);
  });

  it("flags extra unpaired taps after marks run out", () => {
    const event = ev({
      taps: [
        { id: "a", t: 10 },
        { id: "b", t: 20 },
        { id: "c", t: 30 },
      ],
      marks: [{ id: "m1", bib: "1" }],
    });
    const extra = unmatchedTaps(event.taps, event.marks);
    expect(extra.map((t) => t.id)).toEqual(["b", "c"]);
  });

  it("inserts an estimated tap at the midpoint and marks it ~", () => {
    const taps = [
      { id: "a", t: 1_000_000 },
      { id: "b", t: 1_002_000 },
    ];
    expect(estimateMissedTapTime(taps)).toBe(1_001_000);
    let event = ev({ taps, marks: [{ id: "m1", bib: "1" }, { id: "m2", bib: "2" }] });
    event = applyEdit(event, { action: "tap-insert-estimated", actor: "timer" }, 9);
    const live = liveTaps(event.taps);
    expect(live).toHaveLength(3);
    const est = live.find((t) => t.estimated);
    expect(est?.t).toBe(1_001_000);
    expect(formatEst("0:01.0", est?.estimated)).toBe("~0:01.0");
    expect(event.edits.at(-1)?.kind).toBe("tap-insert");
  });

  it("excludes estimated splits from fastest lap", () => {
    // 200m + two 400m laps: slow 80s, then a fake-fast estimated 40s lap.
    const start = 0;
    const event = ev({
      startedAt: start,
      taps: [
        { id: "t0", t: 40_000 },
        { id: "t1", t: 120_000 },
        { id: "t2", t: 320_000, estimated: true },
      ],
      marks: [
        { id: "m0", bib: "1" },
        { id: "m1", bib: "1" },
        { id: "m2", bib: "1" },
      ],
    });
    const races = buildRunnerRaces(event);
    const stats = computeRunnerStats(event, races[0], races[0]);
    expect(stats.fastestLapSec).toBeCloseTo(80, 6);
    const pair = fastestSlowestLap(fullLapsFor(event, races[0]));
    expect(pair?.fast.ms).toBe(80_000);
    expect(pair?.fast.estimated).toBe(false);
    expect(pair?.slow.estimated).toBe(true);
    expect(races[0].crossings[2].estimated).toBe(true);
  });

  it("re-pairs instantly when a mark is moved, and pair-delete keeps later pairs aligned", () => {
    let event = ev({
      taps: [
        { id: "a", t: 100 },
        { id: "b", t: 200 },
        { id: "c", t: 300 },
      ],
      marks: [
        { id: "m1", bib: "1" },
        { id: "m2", bib: "2" },
        { id: "m3", bib: "1" },
      ],
    });
    event = applyEdit(event, { action: "move", index: 0, to: 1, actor: "marker" }, 1);
    expect(liveMarks(event.marks).map((m) => m.bib)).toEqual(["2", "1", "1"]);
    let races = buildRunnerRaces(event);
    expect(races.find((r) => r.runner.bib === "2")?.crossings[0].t).toBe(100);

    event = applyEdit(event, { action: "pair-delete", index: 0, actor: "admin" }, 2);
    expect(liveTaps(event.taps)).toHaveLength(2);
    expect(liveMarks(event.marks)).toHaveLength(2);
    races = buildRunnerRaces(event);
    expect(races.find((r) => r.runner.bib === "1")?.crossings[0].t).toBe(200);

    event = applyEdit(event, { action: "restore-last", actor: "admin" }, 3);
    expect(liveTaps(event.taps)).toHaveLength(3);
    expect(liveMarks(event.marks)).toHaveLength(3);
  });

  it("inserts a bib at a live index and shifts later bibs", () => {
    let event = ev({
      taps: [
        { id: "a", t: 100 },
        { id: "b", t: 200 },
        { id: "c", t: 300 },
      ],
      marks: [
        { id: "m1", bib: "1" },
        { id: "m2", bib: "2" },
      ],
    });
    event = applyEdit(event, { action: "insert", index: 1, bib: "07", actor: "admin" }, 5);
    expect(liveMarks(event.marks).map((m) => m.bib)).toEqual(["1", "7", "2"]);
    expect(event.edits.at(-1)?.kind).toBe("mark-insert");
    const races = buildRunnerRaces(event);
    expect(races.find((r) => r.runner.bib === "2")?.crossings[0].t).toBe(300);
  });

  it("reassigns a miss in place by markId without inserting", () => {
    let event = ev({
      marks: [
        { id: "m1", bib: "1" },
        { id: "m2", bib: "?" },
        { id: "m3", bib: "2" },
      ],
    });
    event = applyEdit(event, { action: "reassign", markId: "m2", bib: "10", actor: "marker" }, 6);
    expect(liveMarks(event.marks).map((m) => m.bib)).toEqual(["1", "10", "2"]);
    expect(liveMarks(event.marks).map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
    expect(event.edits.at(-1)?.kind).toBe("mark-reassign");
  });

  it("inserts a tap at a crossing index and shifts later taps", () => {
    let event = ev({
      taps: [
        { id: "a", t: 1_000_000 },
        { id: "b", t: 1_004_000 },
        { id: "c", t: 1_008_000 },
      ],
      marks: [
        { id: "m1", bib: "1" },
        { id: "m2", bib: "2" },
        { id: "m3", bib: "1" },
      ],
    });
    event = applyEdit(event, { action: "tap-insert-at", index: 1, actor: "admin" }, 8);
    const live = liveTaps(event.taps);
    expect(live.map((t) => t.id)).toEqual(["a", live[1].id, "b", "c"]);
    expect(live[1].estimated).toBe(true);
    expect(live[1].t).toBe(1_002_000);
    expect(event.taps.find((t) => t.id === "b")?.t).toBe(1_004_000);
    expect(event.edits.at(-1)).toMatchObject({ kind: "tap-insert", toIndex: 1, actor: "admin" });
    const races = buildRunnerRaces(event);
    expect(races.find((r) => r.runner.bib === "2")?.crossings[0]).toMatchObject({
      t: 1_002_000,
      estimated: true,
    });
    expect(races.find((r) => r.runner.bib === "1")?.crossings[1].t).toBe(1_004_000);
  });

  it("inserts between taps that are only 1ms apart without swapping them", () => {
    let event = ev({
      taps: [
        { id: "a", t: 5_000 },
        { id: "b", t: 5_001 },
      ],
      marks: [
        { id: "m1", bib: "1" },
        { id: "m2", bib: "2" },
      ],
    });
    event = applyEdit(event, { action: "tap-insert-at", index: 1, actor: "admin" }, 1);
    const live = liveTaps(event.taps);
    expect(live.map((t) => t.id).filter((id) => id === "a" || id === "b")).toEqual(["a", "b"]);
    expect(live.findIndex((t) => t.estimated)).toBe(1);
    expect(live[0].id).toBe("a");
    expect(live[2].id).toBe("b");
  });

  it("rewrites a tap time, logs the previous time, and re-sorts the pair", () => {
    let event = ev({
      taps: [
        { id: "a", t: 100, estimated: true },
        { id: "b", t: 300 },
      ],
      marks: [
        { id: "m1", bib: "1" },
        { id: "m2", bib: "2" },
      ],
    });
    event = applyEdit(event, { action: "tap-set-time", id: "a", t: 400, actor: "admin" }, 2);
    expect(liveTaps(event.taps).map((t) => t.id)).toEqual(["b", "a"]);
    expect(event.taps.find((t) => t.id === "a")).toMatchObject({ t: 400, estimated: false });
    expect(event.edits.at(-1)).toMatchObject({
      kind: "tap-time",
      tapId: "a",
      t: 400,
      prevT: 100,
    });
    event = applyEdit(event, { action: "tap-set-time", id: "a", t: 100, actor: "admin" }, 3);
    expect(liveTaps(event.taps).map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("inserts an estimated crossing for a bib so tap and mark share an index", () => {
    let event = ev({
      taps: [
        { id: "a", t: 1_040_000 },
        { id: "b", t: 1_200_000 },
      ],
      marks: [
        { id: "m1", bib: "1" },
        { id: "m2", bib: "2" },
      ],
    });
    event = applyEdit(event, { action: "pair-insert-estimated", bib: "1", actor: "admin" }, 4);
    const taps = liveTaps(event.taps);
    const marks = liveMarks(event.marks);
    expect(taps).toHaveLength(3);
    expect(marks).toHaveLength(3);
    const est = taps.find((t) => t.estimated)!;
    expect(marks[liveIndexOfTap(taps, est.id)].bib).toBe("1");
    const race = buildRunnerRaces(event).find((r) => r.runner.bib === "1")!;
    expect(race.crossings.some((c) => c.estimated)).toBe(true);
  });

  it("appends a pack of bibs in roster order", () => {
    let event = ev({ marks: [{ id: "m1", bib: "1" }] });
    event = applyEdit(event, { action: "append-many", bibs: ["2", "7"], actor: "marker" });
    expect(liveMarks(event.marks).map((m) => m.bib)).toEqual(["1", "2", "7"]);
  });

  it("records an idle only after 4s past the last tap", () => {
    let event = ev({ taps: [{ id: "a", t: 1_000_000 }] });
    event = applyEdit(event, { action: "idle", t: 1_000_000 + 3_000, actor: "timer" });
    expect(event.idles).toEqual([]);
    event = applyEdit(event, { action: "idle", t: 1_000_000 + 4_000, actor: "timer" });
    expect(event.idles).toHaveLength(1);
    event = applyEdit(event, { action: "idle", t: 1_000_000 + 7_000, actor: "timer" });
    expect(event.idles).toHaveLength(1);
  });

  it("records a bib group after the last mark", () => {
    let event = ev({ marks: [{ id: "m1", bib: "1" }] });
    event = applyEdit(event, { action: "group", actor: "marker" });
    expect(event.groups).toEqual([{ id: expect.any(String), afterId: "m1" }]);
    event = applyEdit(event, { action: "group", actor: "marker" });
    expect(event.groups).toHaveLength(1);
    event = applyEdit(event, { action: "append", bib: "2", actor: "marker" });
    event = applyEdit(event, { action: "group", actor: "marker" });
    expect(event.groups).toHaveLength(2);
  });

  it("does not sync when there are no taps or bibs", () => {
    const event = applyEdit(ev(), { action: "sync", actor: "marker" });
    expect(event.syncs).toEqual([]);
  });

  it("pads taps and bibs to max so the next write is a fresh shared slot", () => {
    let event = ev({
      taps: Array.from({ length: 27 }, (_, i) => ({ id: `t${i}`, t: i + 1 })),
      marks: Array.from({ length: 25 }, (_, i) => ({ id: `m${i}`, bib: String(i + 1) })),
    });
    event = applyEdit(event, { action: "sync", actor: "marker" });
    expect(liveTaps(event.taps)).toHaveLength(27);
    expect(liveMarks(event.marks)).toHaveLength(27);
    expect(event.syncs[0]?.taps).toBe(27);
    expect(event.syncs[0]?.marks).toBe(27);
    expect(event.syncs[0]?.padTapIds).toHaveLength(0);
    expect(event.syncs[0]?.padMarkIds).toHaveLength(2);
    event = applyEdit(event, { action: "sync", actor: "marker" });
    expect(event.syncs).toHaveLength(1);
  });
});
