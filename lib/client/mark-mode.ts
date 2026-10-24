"use client";

import { finishTimeFromVideoMs } from "@/lib/client/analyse-time";
import { normalizeCode } from "@/lib/ids";

/**
 * Finish Cam mark modes (locked pref #5).
 * - two-press: Mark 1 (enter) / Mark 2 (exit) — Space advances start → end.
 * - single-press: one press per sprinter as they cross — Space logs each passer.
 */
export type MarkMode = "two-press" | "single-press";

/** Analyse buffer around a single-press mark (±0.5s). */
export const SINGLE_PRESS_BUFFER_MS = 500;

function modeKey(code: string) {
  return `tt:finishCam:markMode:${normalizeCode(code)}`;
}

export function loadMarkMode(code: string): MarkMode {
  try {
    if (typeof window === "undefined") return "two-press";
    return window.localStorage.getItem(modeKey(code)) === "single-press"
      ? "single-press"
      : "two-press";
  } catch {
    return "two-press";
  }
}

export function saveMarkMode(code: string, mode: MarkMode) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(modeKey(code), mode);
  } catch {
    /* private mode */
  }
}

/** Scrubber window for a single-press lane: ±buffer around its press. */
export function singlePressWindow(
  pressesMs: readonly number[],
  lane: number,
  bufferMs: number = SINGLE_PRESS_BUFFER_MS,
): { in: number; out: number } | null {
  const p = pressesMs[lane - 1];
  if (p == null || !Number.isFinite(p)) return null;
  return { in: Math.max(0, Math.round(p - bufferMs)), out: Math.round(p + bufferMs) };
}

export type PressSeed = { lane: number; finishMs: number; tapT: number };

/**
 * Map each press (in order) to the matching lane's finish draft. Press order is
 * lane order, so press i seeds lane i+1. YOLO must not overwrite these — the
 * panel marks them `source: "manual"`.
 */
export function pressSeeds(opts: {
  pressesMs: readonly number[];
  startedAt: number;
  recServerAt: number;
  laneCount: number;
}): PressSeed[] {
  const { pressesMs, startedAt, recServerAt, laneCount } = opts;
  const seeds: PressSeed[] = [];
  for (let i = 0; i < Math.min(laneCount, pressesMs.length); i++) {
    const videoMs = pressesMs[i];
    if (videoMs == null || !Number.isFinite(videoMs)) continue;
    const { finishMs, tapT } = finishTimeFromVideoMs({
      startedAt,
      recServerAt,
      videoMs,
    });
    seeds.push({ lane: i + 1, finishMs, tapT });
  }
  return seeds;
}

/** Race-clock end offset for single-press: the last passer's press. */
export function singlePressEndVideoMs(
  pressesMs: readonly number[],
  fallbackMs: number,
): number {
  const last = pressesMs[pressesMs.length - 1];
  return last != null && Number.isFinite(last) ? Math.round(last) : Math.round(fallbackMs);
}
