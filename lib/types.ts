export type CourseConfig = {
  totalDistanceM: number;
  lapLengthM: number;
  firstPartialM: number;
  requiredCrossings: number;
  targetPaceSecPerKm: number | null;
};

export const DEFAULT_CATEGORIES = ["Girls", "Boys"] as const;

export type Runner = {
  id: string;
  bib: string;
  name: string;
  studentId: string;
  category: string;
  /** Short hash of the Redis photo object; never the bytes. */
  photoVer: string | null;
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
  /** Wall clock when admin ended the race; freezes demo + race clock. */
  endedAt: number | null;
  course: CourseConfig;
  runners: Runner[];
  taps: Tap[];
  marks: Mark[];
  demo: boolean;
  demoAutoMark: boolean;
  demoPlan: DemoPlan[] | null;
  /** Playback speed for demo races (1 = real time). */
  demoSpeed: number;
  /** sha256 hex; never returned to clients. */
  pinHash: string | null;
  /** Present on client payloads; true when a helper PIN is set. */
  hasPin?: boolean;
  hideStudentIds: boolean;
  categories: string[];
  /** Kilometre marks to print in results (must land on a crossing). */
  resultKmSplits: number[];
  /** Bumped on every persist. Polling compares this via a tiny Redis key. */
  rev: number;
};

export type PhotoRecord = {
  v: string;
  mime: string;
  data: string;
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
