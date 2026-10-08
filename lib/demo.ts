import { deriveCourse, splitDistances } from "./course";
import { advanceDemo, raceNow } from "./demo-run";
import { parseClubTime } from "./format";
import { newId, newJoinCode } from "./ids";
import { hashPin } from "./pin";
import { defaultResultKmSplits } from "./results";
import type { DemoPlan, EventState, Runner } from "./types";

/** Fake 8-digit SIDs and names — never real club student IDs. */
export const DEMO_FIELD: {
  bib: string;
  name: string;
  studentId: string;
  category: string;
  final: string;
  k1: string;
  k3: string;
  stopLaps?: number;
}[] = [
  { bib: "15", name: "Lina Kwok", studentId: "20881015", category: "Girls", final: "28'15", k1: "4'40", k3: "16'20" },
  { bib: "6", name: "Maya Chen", studentId: "20881006", category: "Girls", final: "28'50", k1: "5'23", k3: "16'18" },
  { bib: "1", name: "Alex Wong", studentId: "20881001", category: "Boys", final: "17'43", k1: "3'03", k3: "11'25" },
  { bib: "9", name: "Chris Ng", studentId: "20881009", category: "Boys", final: "19'03", k1: "3'34", k3: "11'11" },
  { bib: "13", name: "Ryan Ho", studentId: "20881013", category: "Boys", final: "19'18", k1: "3'47", k3: "11'34" },
  { bib: "2", name: "Jordan Lee", studentId: "20881002", category: "Boys", final: "19'18", k1: "3'39", k3: "11'28" },
  { bib: "17", name: "Owen Tang", studentId: "20881017", category: "Boys", final: "19'22", k1: "3'49", k3: "11'35" },
  { bib: "8", name: "Sam Yu", studentId: "20881008", category: "Boys", final: "19'33", k1: "3'41", k3: "11'37" },
  { bib: "11", name: "Elena Park", studentId: "20881011", category: "Boys", final: "20'02", k1: "3'41", k3: "11'39" },
  { bib: "3", name: "Priya Shah", studentId: "20881003", category: "Boys", final: "20'03", k1: "3'48", k3: "11'43" },
  { bib: "5", name: "Tom Cheng", studentId: "20881005", category: "Boys", final: "20'18", k1: "3'34", k3: "11'38" },
  { bib: "14", name: "Hana Kim", studentId: "20881014", category: "Boys", final: "20'30", k1: "3'47", k3: "11'48" },
  { bib: "7", name: "Yui Sato", studentId: "20881007", category: "Boys", final: "21'30", k1: "3'48", k3: "12'10" },
  { bib: "4", name: "Ben Liu", studentId: "20881004", category: "Boys", final: "21'32", k1: "4'04", k3: "12'39" },
  { bib: "12", name: "Ava Lam", studentId: "20881012", category: "Boys", final: "21'50", k1: "3'47", k3: "12'31" },
  { bib: "20", name: "Marcus Ip", studentId: "20881020", category: "Boys", final: "23'22", k1: "4'05", k3: "13'31" },
  { bib: "10", name: "Zoe Fong", studentId: "20881010", category: "Boys", final: "30'53", k1: "4'12", k3: "16'09" },
  {
    bib: "16",
    name: "Kai Tsang",
    studentId: "20881016",
    category: "Boys",
    final: "32'14",
    k1: "6'46",
    k3: "21'08",
    stopLaps: 11.5,
  },
];

export const DEMO_PIN = "1234";
export const DEMO_SPEED_DEFAULT = 10;

function ms(club: string): number {
  const v = parseClubTime(club);
  if (v == null) throw new Error(`bad club time ${club}`);
  return v;
}

function interpolateElapsed(distanceM: number, anchors: { d: number; t: number }[]): number {
  if (anchors.length === 0) return 0;
  if (distanceM <= anchors[0].d) return anchors[0].t;
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1];
    const b = anchors[i];
    if (distanceM <= b.d || i === anchors.length - 1) {
      if (b.d === a.d) return b.t;
      const u = (distanceM - a.d) / (b.d - a.d);
      return a.t + u * (b.t - a.t);
    }
  }
  return anchors[anchors.length - 1].t;
}

function splitsFor(
  dists: number[],
  k1: number,
  k3: number,
  finalMs: number,
  finalDist: number,
): number[] {
  const anchors = [
    { d: 0, t: 0 },
    { d: 1000, t: k1 },
    { d: 3000, t: k3 },
    { d: finalDist, t: finalMs },
  ];
  let acc = 0;
  const elapsed = dists.map((d) => {
    acc += d;
    return Math.round(interpolateElapsed(acc, anchors));
  });
  return elapsed.map((t, i) => t - (i === 0 ? 0 : elapsed[i - 1]));
}

export function makeDemoEvent(
  now = Date.now(),
  raceElapsedMs = 0,
  speed = DEMO_SPEED_DEFAULT,
): EventState {
  const course = deriveCourse({
    totalDistanceM: 5000,
    lapLengthM: 400,
    targetPaceSecPerKm: 240,
  });
  const allDists = splitDistances(course);
  const runners: Runner[] = [];
  const demoPlan: DemoPlan[] = [];

  for (const d of DEMO_FIELD) {
    const runner: Runner = {
      id: newId(),
      bib: d.bib,
      name: d.name,
      studentId: d.studentId,
      category: d.category,
      photoVer: null,
    };
    runners.push(runner);
    const finalDist =
      d.stopLaps != null ? d.stopLaps * course.lapLengthM : course.totalDistanceM;
    const n =
      d.stopLaps != null
        ? allDists.filter((_, i) => {
            const cum = allDists.slice(0, i + 1).reduce((s, x) => s + x, 0);
            return cum <= finalDist + 0.5;
          }).length
        : allDists.length;
    const dists = allDists.slice(0, n);
    const splitsMs = splitsFor(dists, ms(d.k1), ms(d.k3), ms(d.final), finalDist);
    demoPlan.push({ runnerId: runner.id, bib: d.bib, splitsMs });
  }

  const wallElapsed = speed > 0 ? raceElapsedMs / speed : raceElapsedMs;
  const startedAt = now - wallElapsed;
  const event: EventState = {
    id: newId(),
    code: newJoinCode(),
    name: "5000m TT",
    createdAt: Date.UTC(2026, 8, 28, 2, 0, 0),
    status: "running",
    ready: true,
    startedAt,
    endedAt: null,
    course,
    runners,
    taps: [],
    marks: [],
    idles: [],
    groups: [],
    edits: [],
    demo: true,
    demoAutoMark: true,
    demoPlan,
    demoSpeed: speed,
    pinHash: hashPin(DEMO_PIN),
    helperPin: DEMO_PIN,
    hideStudentIds: false,
    resultKmSplits: defaultResultKmSplits(course),
    rev: 0,
  };
  return advanceDemo(event, raceNow(event, now));
}
