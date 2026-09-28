import { deriveCourse, splitDistances } from "./course";
import { newId, newJoinCode } from "./ids";
import { appendMark, appendTap } from "./race";
import type { DemoPlan, EventState, Runner } from "./types";

const DEMO_RUNNERS: { bib: string; name: string; studentId: string; paceSecPerKm: number }[] = [
  { bib: "1", name: "Alex Wong", studentId: "20451201", paceSecPerKm: 200 },
  { bib: "3", name: "Maya Chen", studentId: "20451202", paceSecPerKm: 208 },
  { bib: "5", name: "Jordan Lee", studentId: "20341108", paceSecPerKm: 215 },
  { bib: "7", name: "Priya Shah", studentId: "20560011", paceSecPerKm: 222 },
  { bib: "8", name: "Chris Ng", studentId: "20228841", paceSecPerKm: 228 },
  { bib: "11", name: "Sam Yu", studentId: "20447721", paceSecPerKm: 235 },
  { bib: "12", name: "Elena Park", studentId: "20190044", paceSecPerKm: 242 },
  { bib: "14", name: "Ryan Ho", studentId: "20330019", paceSecPerKm: 248 },
  { bib: "15", name: "Lina Kwok", studentId: "20412208", paceSecPerKm: 255 },
  { bib: "18", name: "Tom Cheng", studentId: "20215590", paceSecPerKm: 262 },
  { bib: "21", name: "Hana Kim", studentId: "20501123", paceSecPerKm: 270 },
  { bib: "22", name: "Owen Tang", studentId: "20398802", paceSecPerKm: 278 },
  { bib: "24", name: "Yui Sato", studentId: "20470031", paceSecPerKm: 286 },
  { bib: "27", name: "Ben Liu", studentId: "20181245", paceSecPerKm: 294 },
  { bib: "31", name: "Ava Lam", studentId: "20436612", paceSecPerKm: 302 },
  { bib: "33", name: "Marcus Ip", studentId: "20204418", paceSecPerKm: 310 },
  { bib: "36", name: "Zoe Fong", studentId: "20512290", paceSecPerKm: 318 },
  { bib: "42", name: "Kai Tsang", studentId: "20305561", paceSecPerKm: 328 },
];

function mulberry32(seed: number) {
  return function rand() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeDemoEvent(now = Date.now(), elapsedMs = 18 * 60 * 1000): EventState {
  const course = deriveCourse({
    totalDistanceM: 5000,
    lapLengthM: 400,
    targetPaceSecPerKm: 240,
  });
  const dists = splitDistances(course);
  const rng = mulberry32(20260928);
  const runners: Runner[] = [];
  const demoPlan: DemoPlan[] = [];

  for (const d of DEMO_RUNNERS) {
    const runner: Runner = {
      id: newId(),
      bib: d.bib,
      name: d.name,
      studentId: d.studentId,
      photoUrl: null,
    };
    runners.push(runner);
    const splitsMs = dists.map((dist, i) => {
      const fade = 1 + i * 0.006;
      const jitter = 0.97 + rng() * 0.06;
      return (d.paceSecPerKm * (dist / 1000) * fade * jitter) * 1000;
    });
    demoPlan.push({ runnerId: runner.id, bib: d.bib, splitsMs });
  }

  const event: EventState = {
    id: newId(),
    code: newJoinCode(),
    name: "Demo 5000",
    createdAt: now - elapsedMs - 60_000,
    status: "running",
    startedAt: now - elapsedMs,
    course,
    runners,
    taps: [],
    marks: [],
    demo: true,
    demoAutoMark: true,
    demoPlan,
  };
  return advanceDemo(event, now);
}

export function advanceDemo(event: EventState, now: number): EventState {
  if (!event.demo || !event.demoPlan || event.startedAt == null) return event;
  const due: { t: number; bib: string; key: string }[] = [];
  for (const plan of event.demoPlan) {
    let acc = 0;
    for (let i = 0; i < plan.splitsMs.length; i++) {
      acc += plan.splitsMs[i];
      const t = event.startedAt + acc;
      if (t <= now) {
        due.push({ t, bib: plan.bib, key: `demo:${plan.runnerId}:${i}` });
      }
    }
  }
  due.sort((a, b) => a.t - b.t || a.bib.localeCompare(b.bib));

  let taps = event.taps;
  let marks = event.marks;
  const tapIds = new Set(taps.map((x) => x.id));
  for (const d of due) {
    if (tapIds.has(d.key)) continue;
    taps = appendTap(taps, { id: d.key, t: Math.round(d.t) });
    tapIds.add(d.key);
    if (event.demoAutoMark) {
      marks = appendMark(marks, d.bib);
    }
  }
  return { ...event, taps, marks };
}
