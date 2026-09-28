import type { CourseConfig } from "./types";

export const DISTANCE_PRESETS = [
  { id: "1500", meters: 1500 },
  { id: "3000", meters: 3000 },
  { id: "5000", meters: 5000 },
  { id: "10000", meters: 10000 },
] as const;

export type CourseInput = {
  totalDistanceM?: number;
  lapLengthM?: number;
  firstPartialM?: number | null;
  startOffsetM?: number | null;
  fixedCrossings?: number | null;
  targetPaceSecPerKm?: number | null;
};

export function deriveCourse(input: CourseInput = {}): CourseConfig {
  const lapLengthM = Math.max(1, round1(input.lapLengthM ?? 400));
  const targetPaceSecPerKm = input.targetPaceSecPerKm ?? null;

  if (input.fixedCrossings && input.fixedCrossings > 0) {
    const requiredCrossings = Math.round(input.fixedCrossings);
    const explicitPartial = firstPartialFrom(input);
    const firstPartialM =
      explicitPartial == null ? 0 : Math.max(0, round1(explicitPartial));
    const totalDistanceM =
      firstPartialM > 0
        ? firstPartialM + (requiredCrossings - 1) * lapLengthM
        : requiredCrossings * lapLengthM;
    return {
      totalDistanceM,
      lapLengthM,
      firstPartialM,
      requiredCrossings,
      targetPaceSecPerKm,
    };
  }

  const totalDistanceM = Math.max(1, round1(input.totalDistanceM ?? 5000));
  const explicitPartial = firstPartialFrom(input);
  const firstPartialM =
    explicitPartial == null
      ? round1(totalDistanceM % lapLengthM)
      : Math.max(0, Math.min(totalDistanceM, round1(explicitPartial)));

  const requiredCrossings =
    firstPartialM === 0
      ? Math.max(1, Math.ceil(totalDistanceM / lapLengthM - 1e-9))
      : Math.max(1, Math.ceil((totalDistanceM - firstPartialM) / lapLengthM - 1e-9) + 1);

  return {
    totalDistanceM,
    lapLengthM,
    firstPartialM,
    requiredCrossings,
    targetPaceSecPerKm,
  };
}

function firstPartialFrom(input: CourseInput): number | null {
  if (input.firstPartialM != null) return input.firstPartialM;
  if (input.startOffsetM != null) return input.startOffsetM;
  return null;
}

export function defaultFiveK(): CourseConfig {
  return deriveCourse({ totalDistanceM: 5000, lapLengthM: 400 });
}

export function lapsCount(course: CourseConfig): number {
  return course.totalDistanceM / course.lapLengthM;
}

export function crossingDistance(course: CourseConfig, crossingIndex1: number): number {
  if (crossingIndex1 <= 0) return 0;
  if (crossingIndex1 >= course.requiredCrossings) return course.totalDistanceM;
  if (course.firstPartialM > 0) {
    return round1(course.firstPartialM + (crossingIndex1 - 1) * course.lapLengthM);
  }
  return round1(crossingIndex1 * course.lapLengthM);
}

export function splitDistance(course: CourseConfig, splitIndex1: number): number {
  return round1(
    crossingDistance(course, splitIndex1) - crossingDistance(course, splitIndex1 - 1),
  );
}

export function splitDistances(course: CourseConfig): number[] {
  return Array.from({ length: course.requiredCrossings }, (_, i) =>
    splitDistance(course, i + 1),
  );
}

export function minPlausibleSplitMs(distanceM: number): number {
  // 2:05 /km is beyond collegiate distance pace; flags double-taps / mis-assigns.
  const secPerKm = 125;
  return (distanceM / 1000) * secPerKm * 1000;
}

/** Whole-kilometre marks that land exactly on a finish-line crossing. */
export function kmCrossings(course: CourseConfig): { km: number; index: number }[] {
  const out: { km: number; index: number }[] = [];
  for (let i = 1; i <= course.requiredCrossings; i++) {
    const d = crossingDistance(course, i);
    const km = d / 1000;
    if (km >= 1 && Math.abs(km - Math.round(km)) < 0.0005) {
      out.push({ km: Math.round(km), index: i });
    }
  }
  return out;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
