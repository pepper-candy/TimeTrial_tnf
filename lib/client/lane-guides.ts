/**
 * Finish Cam lane perspective guides (Agent 2).
 *
 * Side-on only (Finish Cam): horizontal bands; near (bottom) taller — never equal-split.
 * Head-on (vertical bands) is legacy — loadLaneGuides migrates it to side-on.
 *
 * ---------------------------------------------------------------------------
 * Agent 3 — point → lane API (same polygons as the overlay)
 * ---------------------------------------------------------------------------
 * Persistence: localStorage key `tt.finishCam.laneGuides.${eventCode}`
 * Shape: { version: 1, preset, laneCount, boundaries }  // boundaries length = N+1
 *
 *   import {
 *     loadLaneGuides,
 *     feetPointFromBox,
 *     mapFeetToLane,
 *     pointInLane,
 *     type LaneGuides,
 *   } from "@/lib/client/lane-guides";
 *
 *   const guides = loadLaneGuides(eventCode, laneCount);
 *   const feet = feetPointFromBox(yoloBox);           // bottom-centre of box
 *   const lane = mapFeetToLane(feet, guides);         // 1…N or null
 *   if (lane != null && pointInLane(feet, guides, lane)) { … }
 *
 * Prefer feet / bottom-centre over “which half the whole box covers”.
 * Manual Accept / Set still wins over YOLO.
 */

export type LaneGuidePreset = "side-on" | "head-on";

export type LaneGuides = {
  version: 1;
  preset: LaneGuidePreset;
  laneCount: number;
  /**
   * Normalised 0…1 cuts along the stack axis (Y for side-on, X for head-on).
   * Length = laneCount + 1; always boundaries[0] === 0 and boundaries[N] === 1.
   * Lane k (1-based) occupies [boundaries[k-1], boundaries[k]).
   */
  boundaries: number[];
};

export type NormPoint = { x: number; y: number };

/** Box with normalised corners (YOLO PersonBox-compatible). */
export type NormBox = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export const LANE_GUIDES_STORAGE_PREFIX = "tt.finishCam.laneGuides.";

export function laneGuidesStorageKey(eventCode: string): string {
  return `${LANE_GUIDES_STORAGE_PREFIX}${eventCode}`;
}

/** Stack axis for a preset: side-on → horizontal bands (Y); head-on → vertical (X). */
export function guideAxis(preset: LaneGuidePreset): "x" | "y" {
  return preset === "side-on" ? "y" : "x";
}

const MIN_BAND = 0.02;

/**
 * Default band cuts.
 * - head-on: equal 1/N
 * - side-on: linear taper, **near = bottom = taller** (lane 1 at top / far / thinner).
 *   Never uses equal-split as the only side-on mode.
 */
export function defaultBoundaries(
  laneCount: number,
  preset: LaneGuidePreset,
): number[] {
  const n = Math.max(1, Math.floor(laneCount));
  if (n <= 1) return [0, 1];

  if (preset === "head-on") {
    return Array.from({ length: n + 1 }, (_, i) => i / n);
  }

  // Side-on: weight for lane i (0-based, top→bottom) grows toward bottom (near).
  const weights = Array.from({ length: n }, (_, i) => i + 1);
  const sum = weights.reduce((a, b) => a + b, 0);
  const out = [0];
  let acc = 0;
  for (let i = 0; i < n - 1; i++) {
    acc += weights[i]! / sum;
    out.push(round01(acc));
  }
  out.push(1);
  return sanitizeBoundaries(out, n);
}

export function createLaneGuides(
  laneCount: number,
  preset: LaneGuidePreset = "side-on",
): LaneGuides {
  const n = Math.max(1, Math.floor(laneCount));
  return {
    version: 1,
    preset,
    laneCount: n,
    boundaries: defaultBoundaries(n, preset),
  };
}

/** Re-apply preset defaults (used when toggling side-on ↔ head-on). */
export function applyPreset(guides: LaneGuides, preset: LaneGuidePreset): LaneGuides {
  return {
    ...guides,
    preset,
    boundaries: defaultBoundaries(guides.laneCount, preset),
  };
}

/** Keep N bands when lane count changes; remap proportionally or rebuild preset. */
export function resizeLaneGuides(guides: LaneGuides, laneCount: number): LaneGuides {
  const n = Math.max(1, Math.floor(laneCount));
  if (n === guides.laneCount) return guides;
  // Preserve custom ratios when possible by rebuilding from preset (safe default).
  return createLaneGuides(n, guides.preset);
}

export function sanitizeBoundaries(raw: number[], laneCount: number): number[] {
  const n = Math.max(1, Math.floor(laneCount));
  if (n === 1) return [0, 1];

  const mid = raw
    .slice(1, -1)
    .map((v) => clamp01(v))
    .filter((v) => Number.isFinite(v));

  const cuts: number[] = [0];
  for (const v of mid) {
    const prev = cuts[cuts.length - 1]!;
    const minNext = prev + MIN_BAND;
    const maxAllowed = 1 - MIN_BAND * (n - cuts.length);
    if (minNext >= maxAllowed) break;
    cuts.push(clamp(v, minNext, maxAllowed));
  }
  while (cuts.length < n) {
    const prev = cuts[cuts.length - 1]!;
    const remaining = n - cuts.length + 1;
    cuts.push(prev + (1 - prev) / remaining);
  }
  cuts.length = n;
  cuts.push(1);
  cuts[0] = 0;
  cuts[n] = 1;
  return cuts.map(round01);
}

/**
 * Move an interior boundary (index 1…N-1) during drag.
 * Returns a new guides object.
 */
export function moveBoundary(
  guides: LaneGuides,
  boundaryIndex: number,
  value: number,
): LaneGuides {
  const n = guides.laneCount;
  if (boundaryIndex <= 0 || boundaryIndex >= n) return guides;
  const next = guides.boundaries.slice();
  const lo = next[boundaryIndex - 1]! + MIN_BAND;
  const hi = next[boundaryIndex + 1]! - MIN_BAND;
  if (lo >= hi) return guides;
  next[boundaryIndex] = clamp(value, lo, hi);
  return { ...guides, boundaries: sanitizeBoundaries(next, n) };
}

/** Bottom-centre of a YOLO person box (feet / ground contact proxy). */
export function feetPointFromBox(box: NormBox): NormPoint {
  return {
    x: (box.x1 + box.x2) / 2,
    y: box.y2,
  };
}

/**
 * Map a normalised point → lane 1…N using the same polygons as the overlay.
 * Returns null if guides are empty / invalid.
 */
export function mapFeetToLane(point: NormPoint, guides: LaneGuides): number | null {
  const n = guides.laneCount;
  if (n < 1 || guides.boundaries.length !== n + 1) return null;
  const t = guideAxis(guides.preset) === "y" ? point.y : point.x;
  const v = clamp01(t);
  const b = guides.boundaries;
  for (let i = 0; i < n; i++) {
    const a = b[i]!;
    const c = b[i + 1]!;
    if (i === n - 1) {
      if (v >= a && v <= c) return i + 1;
    } else if (v >= a && v < c) {
      return i + 1;
    }
  }
  return n;
}

/** True if the point falls inside lane’s band polygon (full-frame strip). */
export function pointInLane(
  point: NormPoint,
  guides: LaneGuides,
  lane: number,
): boolean {
  if (lane < 1 || lane > guides.laneCount) return false;
  return mapFeetToLane(point, guides) === lane;
}

/** Band rect in normalised coords for drawing / hit-tests. */
export function laneBandRect(
  guides: LaneGuides,
  lane: number,
): { x: number; y: number; w: number; h: number } | null {
  if (lane < 1 || lane > guides.laneCount) return null;
  const a = guides.boundaries[lane - 1]!;
  const c = guides.boundaries[lane]!;
  if (guideAxis(guides.preset) === "y") {
    return { x: 0, y: a, w: 1, h: c - a };
  }
  return { x: a, y: 0, w: c - a, h: 1 };
}

export function loadLaneGuides(
  eventCode: string,
  laneCount: number,
): LaneGuides {
  const fallback = createLaneGuides(laneCount, "side-on");
  if (typeof window === "undefined" || !eventCode) return fallback;
  try {
    const raw = window.localStorage.getItem(laneGuidesStorageKey(eventCode));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<LaneGuides>;
    if (parsed?.version !== 1) return fallback;
    // Sprint Finish Cam is side-on only. Old head-on saves drew vertical
    // cuttings on YOLO / Set-finish snapshots — migrate + persist.
    const storedWasHeadOn = parsed.preset === "head-on";
    const n = Math.max(1, Math.floor(laneCount));
    const storedN = Math.max(1, Math.floor(Number(parsed.laneCount) || n));
    let guides: LaneGuides;
    if (storedWasHeadOn) {
      guides = createLaneGuides(storedN, "side-on");
    } else {
      const boundaries = Array.isArray(parsed.boundaries)
        ? sanitizeBoundaries(parsed.boundaries.map(Number), storedN)
        : defaultBoundaries(storedN, "side-on");
      guides = {
        version: 1,
        preset: "side-on",
        laneCount: storedN,
        boundaries,
      };
    }
    if (storedN !== n) guides = resizeLaneGuides(guides, n);
    if (storedWasHeadOn) saveLaneGuides(eventCode, guides);
    return guides;
  } catch {
    return fallback;
  }
}

export function saveLaneGuides(eventCode: string, guides: LaneGuides): void {
  if (typeof window === "undefined" || !eventCode) return;
  try {
    const payload: LaneGuides = {
      version: 1,
      preset: guides.preset,
      laneCount: guides.laneCount,
      boundaries: sanitizeBoundaries(guides.boundaries, guides.laneCount),
    };
    window.localStorage.setItem(
      laneGuidesStorageKey(eventCode),
      JSON.stringify(payload),
    );
  } catch {
    /* quota / private mode — ignore */
  }
}

/**
 * Stroke / fill lane bands onto a 2D canvas (Analyse snapshot + optional preview).
 * Coordinates are pixel space matching the video frame.
 */
export function drawLaneGuideBands(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  guides: LaneGuides,
  highlightLane: number | null = null,
): void {
  const n = guides.laneCount;
  ctx.save();
  for (let lane = 1; lane <= n; lane++) {
    const rect = laneBandRect(guides, lane);
    if (!rect) continue;
    const x = rect.x * width;
    const y = rect.y * height;
    const w = rect.w * width;
    const h = rect.h * height;
    if (highlightLane === lane) {
      ctx.fillStyle = "rgba(34, 197, 94, 0.14)";
      ctx.fillRect(x, y, w, h);
    }
  }
  ctx.strokeStyle = "rgba(255,255,255,0.32)";
  ctx.lineWidth = 1;
  for (let i = 1; i < n; i++) {
    const t = guides.boundaries[i]!;
    ctx.beginPath();
    if (guideAxis(guides.preset) === "y") {
      const y = t * height;
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    } else {
      const x = t * width;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function round01(v: number): number {
  return Math.round(clamp01(v) * 1e6) / 1e6;
}
