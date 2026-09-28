export type CourseConfig = {
  totalDistanceM: number;
  lapLengthM: number;
  firstPartialM: number;
  requiredCrossings: number;
  targetPaceSecPerKm: number | null;
};

export type Runner = {
  id: string;
  bib: string;
  name: string;
  studentId: string;
  photoUrl: string | null;
};

export type Tap = {
  id: string;
  t: number;
};

export type Mark = {
  id: string;
  bib: string;
};

export type DemoPlan = {
  runnerId: string;
  bib: string;
  splitsMs: number[];
};

export type EventStatus = "setup" | "running" | "finished";

export type EventState = {
  id: string;
  code: string;
  name: string;
  createdAt: number;
  status: EventStatus;
  startedAt: number | null;
  course: CourseConfig;
  runners: Runner[];
  taps: Tap[];
  marks: Mark[];
  demo: boolean;
  demoAutoMark: boolean;
  demoPlan: DemoPlan[] | null;
};

export type FlagKind = "too-fast" | "over-count" | "unknown-bib";

export type DataFlag = {
  kind: FlagKind;
  runnerId?: string;
  bib: string;
  index: number;
  detail: string;
};

export type Pair = {
  index: number;
  tap: Tap | null;
  mark: Mark | null;
};
