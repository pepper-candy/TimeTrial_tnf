import { describe, expect, it } from "vitest";
import { defaultFiveK, kmCrossings } from "./course";
import { makeDemoEvent } from "./demo";
import { formatClubMs, formatClubPace, formatSplitDelta } from "./format";
import { buildRunnerRaces } from "./race";
import {
  defaultResultKmSplits,
  formatResultsText,
  kmSplitElapsed,
  lapsCompleted,
  rankEmoji,
} from "./results";
import type { EventState, Runner } from "./types";

function runner(partial: Partial<Runner> & { bib: string }): Runner {
  return {
    id: `id-${partial.bib}`,
    name: partial.name ?? `R${partial.bib}`,
    studentId: partial.studentId ?? `208810${partial.bib.padStart(2, "0")}`,
    category: partial.category ?? "Boys",
    photoVer: null,
    ...partial,
  };
}

function event(partial: Partial<EventState> = {}): EventState {
  return {
    id: "e",
    code: "ZZZZZ",
    name: "5000m TT",
    createdAt: Date.UTC(2026, 8, 28),
    status: "finished",
    ready: true,
    startedAt: Date.UTC(2026, 8, 28, 2, 0, 0),
    endedAt: Date.UTC(2026, 8, 28, 3, 0, 0),
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
    hideStudentIds: false,
    helperPin: null,
    resultKmSplits: [1, 3],
    rev: 0,
    ...partial,
  };
}

function crossings(start: number, bib: string, elapsedMs: number[]) {
  let t = start;
  const taps = elapsedMs.map((ms, i) => {
    t = start + ms;
    return { id: `${bib}-t${i}`, t };
  });
  const marks = elapsedMs.map((_, i) => ({ id: `${bib}-m${i}`, bib }));
  return { taps, marks };
}

describe("club results text", () => {
  it("emits WhatsApp-ready ranks, club times, km splits, avg, and DNF laps", () => {
    const start = Date.UTC(2026, 8, 28, 2, 0, 0);
    const girl = runner({
      bib: "15",
      name: "Lina Kwok",
      studentId: "20881015",
      category: "Girls",
    });
    const boy = runner({
      bib: "1",
      name: "Alex Wong",
      studentId: "20881001",
      category: "Boys",
    });
    const dnf = runner({
      bib: "16",
      name: "Kai Tsang",
      studentId: "20881016",
      category: "Boys",
    });

    const g = crossings(start, "15", [
      56_000, 168_000, 280_000, 392_000, 504_000, 616_000, 728_000, 980_000,
      1_148_000, 1_316_000, 1_484_000, 1_652_000, 1_695_000,
    ]);
    const b = crossings(start, "1", [
      36_600, 109_800, 183_000, 256_200, 329_400, 402_600, 475_800, 685_000,
      760_600, 836_200, 911_800, 987_400, 1_063_000,
    ]);
    // 12 crossings = 11.5 laps (4600 m). 1K = #3, 3K = #8.
    const d = crossings(start, "16", [
      81_200, 243_600, 406_000, 568_400, 730_800, 893_200, 1_055_600, 1_268_000,
      1_475_000, 1_682_000, 1_889_000, 1_934_000,
    ]);

    const ev = event({
      runners: [girl, boy, dnf],
      taps: [...g.taps, ...b.taps, ...d.taps].sort((a, c) => a.t - c.t),
      marks: [...g.taps, ...b.taps, ...d.taps]
        .sort((a, c) => a.t - c.t)
        .map((t) => {
          const bib = t.id.split("-")[0];
          return { id: t.id.replace("-t", "-m"), bib };
        }),
    });

    const text = formatResultsText(ev);
    expect(text).toBe(
      [
        "*5000m TT on 28 September 2026*",
        "",
        "*Girls:*",
        "1️⃣Bib No.15 (20881015)",
        "Result: 28'15 (1K: 4'40; 3K: 16'20)",
        "Avg.: 5'39/K",
        "",
        "*Boys:*",
        "1️⃣Bib No.1 (20881001)",
        "Result: 17'43 (1K: 3'03; 3K: 11'25)",
        "Avg.: 3'33/K",
        "",
        "2️⃣Bib No.16 (20881016)",
        "Result: 32'14 (11.5 laps) (1K: 6'46; 3K: 21'08)",
        "Avg.: 7'00/K",
        "",
      ].join("\n"),
    );
  });

  it("matches seeded demo crossings for the 28 Sep 2026 5k times with fake IDs", () => {
    const now = Date.UTC(2026, 8, 28, 8, 0, 0);
    const demo = makeDemoEvent(now, 40 * 60 * 1000, 1);
    const races = buildRunnerRaces(demo);
    const text = formatResultsText(demo, races);

    expect(text.startsWith("*5000m TT on 28 September 2026*\n\n*Girls:*\n")).toBe(true);
    expect(text).toContain(
      "1️⃣Bib No.15 (20881015)\nResult: 28'15 (1K: 4'40; 3K: 16'20)\nAvg.: 5'39/K",
    );
    expect(text).toContain(
      "2️⃣Bib No.6 (20881006)\nResult: 28'50 (1K: 5'23; 3K: 16'18)\nAvg.: 5'46/K",
    );
    expect(text).toContain(
      "1️⃣Bib No.1 (20881001)\nResult: 17'43 (1K: 3'03; 3K: 11'25)\nAvg.: 3'33/K",
    );
    expect(text).toContain(
      "1️⃣6️⃣Bib No.16 (20881016)\nResult: 32'14 (11.5 laps) (1K: 6'46; 3K: 21'08)\nAvg.: 7'00/K",
    );
    expect(text.indexOf("*Girls:*")).toBeLessThan(text.indexOf("*Boys:*"));

    const sixteen = races.find((r) => r.runner.bib === "16")!;
    expect(sixteen.finished).toBe(false);
    expect(sixteen.crossings).toHaveLength(12);
    expect(lapsCompleted(demo, sixteen)).toBeCloseTo(11.5, 6);
    expect(kmSplitElapsed(demo, sixteen, 1)).toBe(parseClub("6'46"));
    expect(kmSplitElapsed(demo, sixteen, 3)).toBe(parseClub("21'08"));
    expect(demo.runners.every((r) => /^20881\d{3}$/.test(r.studentId))).toBe(true);
  });
});

describe("rank emoji and club time", () => {
  it("uses keycap 1–9, 🔟 for 10, then concatenated digits", () => {
    expect(rankEmoji(1)).toBe("1️⃣");
    expect(rankEmoji(9)).toBe("9️⃣");
    expect(rankEmoji(10)).toBe("🔟");
    expect(rankEmoji(11)).toBe("1️⃣1️⃣");
    expect(rankEmoji(16)).toBe("1️⃣6️⃣");
  });

  it("formats M'SS with rounded seconds", () => {
    expect(formatClubMs(1_695_000)).toBe("28'15");
    expect(formatClubPace(339)).toBe("5'39");
    expect(formatClubPace(212.6)).toBe("3'33");
  });
});

describe("5k crossing km marks", () => {
  it("places 1K on crossing 3 and 3K on crossing 8", () => {
    const kms = kmCrossings(defaultFiveK());
    expect(kms).toEqual([
      { km: 1, index: 3 },
      { km: 3, index: 8 },
      { km: 5, index: 13 },
    ]);
    expect(defaultResultKmSplits(defaultFiveK())).toEqual([1, 3]);
  });
});

describe("category grouping", () => {
  it("groups Girls then Boys, and puts runners with no category under Other once", () => {
    const start = Date.UTC(2026, 8, 28, 2, 0, 0);
    const g = crossings(start, "15", [280_000]);
    const boy = crossings(start, "1", [183_000]);
    const blank = crossings(start, "7", [250_000]);
    const taps = [...g.taps, ...boy.taps, ...blank.taps].sort((a, c) => a.t - c.t);
    const ev = event({
      runners: [
        runner({ bib: "15", studentId: "20881015", category: "Girls" }),
        runner({ bib: "1", studentId: "20881001", category: "Boys" }),
        runner({ bib: "7", studentId: "20881007", category: "" }),
      ],
      taps,
      marks: taps.map((t) => ({
        id: t.id.replace("-t", "-m"),
        bib: t.id.split("-")[0],
      })),
    });
    const text = formatResultsText(ev);
    expect(text.indexOf("*Girls:*")).toBeLessThan(text.indexOf("*Boys:*"));
    expect(text.indexOf("*Boys:*")).toBeLessThan(text.indexOf("*Other:*"));
    expect(text.match(/Bib No\.7/g)?.length).toBe(1);
    expect(text.slice(text.indexOf("*Other:*"))).toContain("Bib No.7");
  });

  it("prints one ranked list without headings when nobody has a category", () => {
    const start = Date.UTC(2026, 8, 28, 2, 0, 0);
    const a = crossings(start, "1", [183_000]);
    const b = crossings(start, "2", [190_000]);
    const taps = [...a.taps, ...b.taps].sort((x, y) => x.t - y.t);
    const ev = event({
      runners: [
        runner({ bib: "1", category: "" }),
        runner({ bib: "2", category: "" }),
      ],
      taps,
      marks: taps.map((t) => ({ id: t.id.replace("-t", "-m"), bib: t.id.split("-")[0] })),
    });
    const text = formatResultsText(ev);
    expect(text).not.toMatch(/\*(Girls|Boys|Other):\*/);
    expect(text).toContain("1️⃣Bib No.1");
    expect(text).toContain("2️⃣Bib No.2");
  });
});

function parseClub(s: string) {
  const m = s.match(/^(\d+)'(\d{2})$/)!;
  return (Number(m[1]) * 60 + Number(m[2])) * 1000;
}

describe("detailed results text", () => {
  it("lists exact km, ~ estimates, fast/slow lap, even half-split, and consistency", () => {
    const start = Date.UTC(2026, 8, 28, 2, 0, 0);
    const splits = [40_000, ...Array.from({ length: 12 }, () => 80_000)];
    let acc = 0;
    const elapsed = splits.map((s) => {
      acc += s;
      return acc;
    });
    const c = crossings(start, "1", elapsed);
    const ev = event({
      runners: [runner({ bib: "1", studentId: "20881001", category: "Boys" })],
      taps: c.taps,
      marks: c.marks,
    });
    const text = formatResultsText(ev, undefined, "detailed");
    expect(text).toBe(
      [
        "*5000m TT on 28 September 2026*",
        "_Detailed_",
        "",
        "*Boys:*",
        "1️⃣*Bib No.1* (20881001)",
        "*16'40* · Avg 3'20/K",
        "1K 3'20 · 2K ~6'40 · 3K 10'00 · 4K ~13'20 · 5K 16'40",
        "Fast L1 1'20 · Slow L12 1'20 · Half 8'20/8'20 (0) · Cons 0%",
        "",
      ].join("\n"),
    );
  });

  it("marks a positive split when the second half is slower, with lap numbers", () => {
    const start = Date.UTC(2026, 8, 28, 2, 0, 0);
    const splits = [35_000, ...Array.from({ length: 6 }, () => 70_000), ...Array.from({ length: 6 }, () => 90_000)];
    let acc = 0;
    const elapsed = splits.map((s) => {
      acc += s;
      return acc;
    });
    const c = crossings(start, "1", elapsed);
    const ev = event({
      runners: [runner({ bib: "1", studentId: "20881001", category: "Boys" })],
      taps: c.taps,
      marks: c.marks,
    });
    const text = formatResultsText(ev, undefined, "detailed");
    expect(text).toContain("Fast L1 1'10");
    expect(text).toContain("Slow L12 1'30");
    expect(text).toMatch(/Half 7'18\/9'18 \(\+2'00\)/);
    expect(text).toContain("Cons ");
    expect(formatSplitDelta(11_400)).toBe("+11");
    expect(formatSplitDelta(-12_400)).toBe("-12");
    expect(formatSplitDelta(0)).toBe("0");
  });

  it("does not list a sub-20s lap as the fast lap", () => {
    const start = Date.UTC(2026, 8, 28, 2, 0, 0);
    const splits = [40_000, 80_000, 5_000, 90_000];
    let acc = 0;
    const elapsed = splits.map((s) => {
      acc += s;
      return acc;
    });
    const c = crossings(start, "1", elapsed);
    const ev = event({
      runners: [runner({ bib: "1", studentId: "20881001", category: "Boys" })],
      taps: c.taps,
      marks: c.marks,
    });
    const text = formatResultsText(ev, undefined, "detailed");
    expect(text).toContain("Fast L1 1'20");
    expect(text).toContain("Slow L3 1'30");
    expect(text).not.toContain("0'05");
    expect(text).toContain("Avg 3'30/K");
  });
});
