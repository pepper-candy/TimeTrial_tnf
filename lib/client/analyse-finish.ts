/**
 * Finish Cam Analyse: sample Mark1…Mark2, run in-app YOLO, propose per-lane times.
 *
 * Timing = event.startedAt + (recServerAt offset? no) video offset of chest cross.
 * Race clock uses Starter server startedAt; video time is relative to recording start
 * (recServerAt). Finish epoch = startedAt + finishElapsedMs = recServerAt + crossVideoMs
 *
 * YOLO does NOT use the +1s pad — only markInMs…markOutMs.
 */

import { FINISH_LINE_X, laneFromY, sprintersForAnalyse } from "@/lib/client/analyse-lanes";
import { detectPersons, loadPersonModel, type PersonBox } from "@/lib/client/yolo-person";
import type { EventState, Runner } from "@/lib/types";

export { FINISH_LINE_X, laneFromY, sprintersForAnalyse } from "@/lib/client/analyse-lanes";

/** Sample stride on the Mark1–Mark2 slice (ms). */
export const SAMPLE_EVERY_MS = 80;

export type LaneSuggestion = {
  lane: number;
  bib: string;
  runnerId: string;
  name: string;
  /** Elapsed ms after startedAt; null = no detection. */
  finishMs: number | null;
  /** Absolute tap epoch (= startedAt + finishMs). */
  tapT: number | null;
  /** Confidence / how the time was found. */
  source: "yolo" | "none";
  score: number | null;
  /**
   * JPEG data URL of the sampled finish frame with YOLO box + red finish line
   * (and lane bands) drawn — for confirm before Accept. Null if no detection.
   */
  snapshotDataUrl: string | null;
  /** Person box on that snapshot (normalised 0–1). */
  box: PersonBox | null;
  /** Video offset (ms) of the snapshot frame. */
  snapshotVideoMs: number | null;
};

export type AnalyseProgress = {
  phase: "model" | "frames" | "done" | "error";
  message: string;
  done: number;
  total: number;
};

function seekVideo(video: HTMLVideoElement, timeSec: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error("seek failed"));
    };
    function cleanup() {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onErr);
    }
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onErr);
    const t = Math.max(0, Math.min(timeSec, (video.duration || timeSec) - 0.001));
    if (Math.abs(video.currentTime - t) < 0.001) {
      cleanup();
      resolve();
      return;
    }
    video.currentTime = t;
  });
}

type LaneTrack = {
  prevCx: number | null;
  prevVideoMs: number | null;
  prevBox: PersonBox | null;
  crossVideoMs: number | null;
  /** Closest-to-line frame if no clean left/right cross was seen. */
  nearMs: number | null;
  nearDist: number;
  score: number;
  /** Sampled frame used for the confirm snapshot (closest to cross). */
  snapshotVideoMs: number | null;
  finishBox: PersonBox | null;
};

function emptySuggestion(runner: Runner, lane: number): LaneSuggestion {
  return {
    lane,
    bib: runner.bib,
    runnerId: runner.id,
    name: runner.name || runner.studentId || runner.bib,
    finishMs: null,
    tapT: null,
    source: "none",
    score: null,
    snapshotDataUrl: null,
    box: null,
    snapshotVideoMs: null,
  };
}

/**
 * Draw finish frame + YOLO person box + red centre line + lane band guides.
 */
export function drawFinishSnapshot(
  ctx: CanvasRenderingContext2D,
  frame: CanvasImageSource,
  width: number,
  height: number,
  box: PersonBox | null,
  laneCount: number,
  highlightLane: number | null,
): void {
  ctx.drawImage(frame, 0, 0, width, height);

  // Lane band guides (horizontal)
  const n = Math.max(1, laneCount);
  ctx.save();
  for (let i = 1; i < n; i++) {
    const y = (i / n) * height;
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  if (highlightLane != null && highlightLane >= 1 && highlightLane <= n) {
    const y0 = ((highlightLane - 1) / n) * height;
    const y1 = (highlightLane / n) * height;
    ctx.fillStyle = "rgba(34, 197, 94, 0.12)";
    ctx.fillRect(0, y0, width, y1 - y0);
  }
  ctx.restore();

  // Red finishing line (centre vertical)
  const lx = FINISH_LINE_X * width;
  ctx.save();
  ctx.strokeStyle = "#ef4444";
  ctx.lineWidth = Math.max(2, Math.round(width * 0.004));
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 2;
  ctx.beginPath();
  ctx.moveTo(lx, 0);
  ctx.lineTo(lx, height);
  ctx.stroke();
  ctx.restore();

  if (box) {
    const x = box.x1 * width;
    const y = box.y1 * height;
    const w = (box.x2 - box.x1) * width;
    const h = (box.y2 - box.y1) * height;
    ctx.save();
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = Math.max(2, Math.round(width * 0.004));
    ctx.strokeRect(x, y, w, h);
    // Chest sample
    const cx = box.chestX * width;
    const cy = box.chestY * height;
    ctx.fillStyle = "#22c55e";
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(3, width * 0.006), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/**
 * Run YOLO on Mark1…Mark2 and propose one finish time per lane/runner.
 */
export async function analyseFinishClip(opts: {
  blob: Blob;
  markInMs: number;
  markOutMs: number;
  /** Wall ms when recording began (offset-corrected). */
  recServerAt: number;
  event: EventState;
  onProgress?: (p: AnalyseProgress) => void;
}): Promise<LaneSuggestion[]> {
  const { blob, markInMs, markOutMs, recServerAt, event, onProgress } = opts;
  const runners = sprintersForAnalyse(event);
  const startedAt = event.startedAt;
  if (startedAt == null) {
    throw new Error("Race has no start time — wait for Starter bang");
  }
  if (markInMs == null || markOutMs == null || markOutMs <= markInMs) {
    throw new Error("Need Mark 1 and Mark 2 before Analyse");
  }

  onProgress?.({ phase: "model", message: "Loading person model…", done: 0, total: 1 });
  await loadPersonModel();

  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("Could not open recording"));
    });

    const from = markInMs;
    const to = markOutMs; // Mark1…Mark2 only — pad not used for YOLO
    const times: number[] = [];
    for (let t = from; t <= to; t += SAMPLE_EVERY_MS) times.push(t);
    if (times[times.length - 1] !== to) times.push(to);

    const laneCount = Math.max(1, runners.length);
    const tracks: LaneTrack[] = Array.from({ length: laneCount }, () => ({
      prevCx: null,
      prevVideoMs: null,
      prevBox: null,
      crossVideoMs: null,
      nearMs: null,
      nearDist: 1,
      score: 0,
      snapshotVideoMs: null,
      finishBox: null,
    }));

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas unavailable");

    for (let i = 0; i < times.length; i++) {
      const videoMs = times[i]!;
      onProgress?.({
        phase: "frames",
        message: `Detecting… ${i + 1}/${times.length}`,
        done: i + 1,
        total: times.length,
      });
      await seekVideo(video, videoMs / 1000);
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) continue;
      canvas.width = vw;
      canvas.height = vh;
      ctx.drawImage(video, 0, 0);
      const boxes = await detectPersons(canvas);
      applyFrame(tracks, boxes, videoMs, laneCount);
    }

    for (const track of tracks) {
      if (track.crossVideoMs == null && track.nearMs != null && track.nearDist < 0.08) {
        track.crossVideoMs = track.nearMs;
        if (track.snapshotVideoMs == null && track.nearMs != null) {
          track.snapshotVideoMs = track.nearMs;
        }
      }
    }

    // Second pass: seek to each lane’s finish frame and bake annotated JPEG
    const snapCanvas = document.createElement("canvas");
    const snapCtx = snapCanvas.getContext("2d");
    if (!snapCtx) throw new Error("Canvas unavailable");

    const snapshotByLane: (string | null)[] = Array.from({ length: laneCount }, () => null);
    const lanesNeedingSnap = tracks
      .map((t, idx) => ({ t, idx }))
      .filter(({ t }) => t.crossVideoMs != null && t.snapshotVideoMs != null);

    for (let s = 0; s < lanesNeedingSnap.length; s++) {
      const { t, idx } = lanesNeedingSnap[s]!;
      onProgress?.({
        phase: "frames",
        message: `Snapshots… ${s + 1}/${lanesNeedingSnap.length}`,
        done: s + 1,
        total: Math.max(1, lanesNeedingSnap.length),
      });
      const snapMs = t.snapshotVideoMs!;
      await seekVideo(video, snapMs / 1000);
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) continue;
      snapCanvas.width = vw;
      snapCanvas.height = vh;
      drawFinishSnapshot(snapCtx, video, vw, vh, t.finishBox, laneCount, idx + 1);
      snapshotByLane[idx] = snapCanvas.toDataURL("image/jpeg", 0.82);
    }

    onProgress?.({ phase: "done", message: "Done", done: times.length, total: times.length });

    return runners.map((runner, idx) => {
      const track = tracks[idx]!;
      const crossVideoMs = track.crossVideoMs;
      if (crossVideoMs == null) {
        return emptySuggestion(runner, idx + 1);
      }
      const tapT = Math.round(recServerAt + crossVideoMs);
      const finishMs = Math.max(0, tapT - startedAt);
      return {
        lane: idx + 1,
        bib: runner.bib,
        runnerId: runner.id,
        name: runner.name || runner.studentId || runner.bib,
        finishMs,
        tapT,
        source: "yolo" as const,
        score: track.score,
        snapshotDataUrl: snapshotByLane[idx] ?? null,
        box: track.finishBox,
        snapshotVideoMs: track.snapshotVideoMs,
      };
    });
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute("src");
    video.load();
  }
}

function applyFrame(
  tracks: LaneTrack[],
  boxes: PersonBox[],
  videoMs: number,
  laneCount: number,
) {
  // Best box per lane this frame
  const best: { box: PersonBox; score: number }[] = Array.from(
    { length: laneCount },
    () => ({ box: null as unknown as PersonBox, score: -1 }),
  );
  for (const box of boxes) {
    const lane = laneFromY(box.chestY, laneCount);
    const i = lane - 1;
    if (box.score > best[i]!.score) best[i] = { box, score: box.score };
  }

  for (let i = 0; i < laneCount; i++) {
    const track = tracks[i]!;
    const hit = best[i]!;
    if (hit.score < 0) {
      track.prevCx = null;
      track.prevVideoMs = null;
      track.prevBox = null;
      continue;
    }
    const cx = hit.box.chestX;
    const prev = track.prevCx;
    const prevMs = track.prevVideoMs;
    const prevBox = track.prevBox;
    if (track.crossVideoMs == null && prev != null && prevMs != null) {
      const crossed =
        (prev < FINISH_LINE_X && cx >= FINISH_LINE_X) ||
        (prev > FINISH_LINE_X && cx <= FINISH_LINE_X);
      if (crossed) {
        const span = cx - prev;
        const frac =
          Math.abs(span) < 1e-6 ? 0 : (FINISH_LINE_X - prev) / span;
        const clamped = Math.max(0, Math.min(1, frac));
        track.crossVideoMs = Math.round(prevMs + (videoMs - prevMs) * clamped);
        track.score = hit.score;
        // Closest sampled frame to the interpolated cross
        const useCurrent =
          Math.abs(videoMs - track.crossVideoMs) <= Math.abs(prevMs - track.crossVideoMs);
        track.snapshotVideoMs = useCurrent ? videoMs : prevMs;
        track.finishBox = useCurrent ? hit.box : (prevBox ?? hit.box);
      }
    }
    const dist = Math.abs(cx - FINISH_LINE_X);
    if (track.crossVideoMs == null && dist < track.nearDist) {
      track.nearDist = dist;
      track.nearMs = videoMs;
      track.score = hit.score;
      track.snapshotVideoMs = videoMs;
      track.finishBox = hit.box;
    }
    track.prevCx = cx;
    track.prevVideoMs = videoMs;
    track.prevBox = hit.box;
  }
}

/** Slice Mark1…Mark2 (+ optional pad) from a WebM blob via MediaSource is hard;
 *  we re-encode by capturing canvas frames — for download we just offer the full blob
 *  or a tip that YOLO used Mark1…Mark2. Optional: download full only. */
export async function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
