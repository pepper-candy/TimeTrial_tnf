"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  analyseFinishClip,
  downloadBlob,
  type AnalyseProgress,
} from "@/lib/client/analyse-finish";
import { FINISH_LINE_X, sprintersForAnalyse } from "@/lib/client/analyse-lanes";
import {
  drawLaneGuideBands,
  loadLaneGuides,
} from "@/lib/client/lane-guides";
import {
  FRAME_STEP_SEC,
  applyLaneProposal,
  finishTimeFromVideoMs,
  type LaneFinishState,
  videoMsFromFinishMs,
} from "@/lib/client/analyse-time";
import type { FinishCamMeta } from "@/lib/client/finish-cam";
import {
  pressSeeds,
  SINGLE_PRESS_BUFFER_MS,
  singlePressWindow,
} from "@/lib/client/mark-mode";
import { uploadFinishSnapshot } from "@/lib/client/photo";
import { acceptSprintFinish } from "@/lib/client/sprint-records";
import { prefetchPersonModel } from "@/lib/client/yolo-person";
import { formatClock } from "@/lib/format";
import type { EventState } from "@/lib/types";
import { BigBtn } from "@/components/shell";

export type FinishSnapshotPreview = {
  bib: string;
  lane: number;
  name: string;
  snapshotDataUrl: string;
  finishMs: number | null;
};

function emptyRows(event: EventState): LaneFinishState[] {
  return sprintersForAnalyse(event).map((runner, idx) => ({
    lane: idx + 1,
    bib: runner.bib,
    runnerId: runner.id,
    name: runner.name || runner.studentId || runner.bib,
    finishMs: null,
    tapT: null,
    snapshotDataUrl: null,
    snapshotVideoMs: null,
    source: "none",
    locked: false,
    accepted: false,
  }));
}

function captureFrameJpeg(
  video: HTMLVideoElement,
  highlightLane: number | null,
  laneCount: number,
  eventCode: string,
): string | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;
  const canvas = document.createElement("canvas");
  canvas.width = vw;
  canvas.height = vh;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, vw, vh);

  // Same calibrated polygons as LaneGuidesOverlay (Agent 2)
  const guides = loadLaneGuides(eventCode, laneCount);
  drawLaneGuideBands(ctx, vw, vh, guides, highlightLane);

  const lx = FINISH_LINE_X * vw;
  ctx.save();
  ctx.strokeStyle = "#ef4444";
  ctx.lineWidth = Math.max(2, Math.round(vw * 0.004));
  ctx.beginPath();
  ctx.moveTo(lx, 0);
  ctx.lineTo(lx, vh);
  ctx.stroke();
  ctx.restore();

  return canvas.toDataURL("image/jpeg", 0.82);
}

/**
 * Finish Cam Analyse scrubber (P0).
 * Opens immediately on Analyse — no YOLO wait.
 *
 * Agent 3 extension points:
 * - Lane state: `LaneFinishState` + `setRows` (merge with `applyLaneProposal`)
 * - Accept: `acceptOne` → `acceptSprintFinish(code, bib, tapT)` → Board
 * - Time map: `finishTimeFromVideoMs({ startedAt, recServerAt, videoMs })`
 * YOLO must only fill lanes where `canProposeLaneFinish(row)` is true.
 */
export function FinishAnalysePanel({
  code,
  event,
  blob,
  meta,
  markInMs,
  markOutMs,
  videoRef,
  onScrubberUrl,
  onEvent,
  onLog,
  onStatus,
  onAnalyseStarted,
  onHasResults,
  onShowSnapshot,
  shownBib,
}: {
  code: string;
  event: EventState;
  blob: Blob | null;
  meta: FinishCamMeta | null;
  markInMs: number | null;
  markOutMs: number | null;
  /** Shared stage <video> controlled by this panel while scrubbing. */
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Object URL for the stage video (page sets src). */
  onScrubberUrl: (url: string | null) => void;
  onEvent: (e: EventState) => void;
  onLog: (msg: string) => void;
  onStatus: (s: string) => void;
  onAnalyseStarted?: () => void;
  onHasResults?: (has: boolean) => void;
  onShowSnapshot?: (preview: FinishSnapshotPreview | null) => void;
  shownBib?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<LaneFinishState[]>([]);
  const [selectedLane, setSelectedLane] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [videoMs, setVideoMs] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** Background YOLO status — never gates scrubber open. */
  const [yoloChip, setYoloChip] = useState<"idle" | "scanning" | "done" | "error">(
    "idle",
  );
  const [yoloProgress, setYoloProgress] = useState({ done: 0, total: 0 });
  const objectUrlRef = useRef<string | null>(null);
  const startedRef = useRef(false);
  const yoloRunIdRef = useRef(0);
  const eventRef = useRef(event);
  eventRef.current = event;
  const onLogRef = useRef(onLog);
  onLogRef.current = onLog;

  /** Single-press mode: one press per sprinter, resolved within a ±0.5s buffer. */
  const presses = meta?.pressesMs ?? null;
  const isSinglePress = presses != null && presses.length > 0;

  function windowFor(lane: number): { in: number; out: number } {
    const w = singlePressWindow(presses ?? [], lane);
    if (w) return w;
    const first = presses?.[0];
    const last = presses?.[presses.length - 1];
    if (first == null || last == null) return { in: 0, out: 0 };
    return {
      in: Math.max(0, Math.round(first - SINGLE_PRESS_BUFFER_MS)),
      out: Math.round(last + SINGLE_PRESS_BUFFER_MS),
    };
  }

  const markIn = isSinglePress
    ? windowFor(selectedLane).in
    : meta?.markInMs ?? markInMs;
  const markOut = isSinglePress
    ? windowFor(selectedLane).out
    : meta?.markOutMs ?? markOutMs;
  const recServerAt = meta?.recServerAt ?? event.startedAt ?? 0;
  const laneCount = Math.max(1, sprintersForAnalyse(event).length);

  const sliceReady = isSinglePress
    ? blob != null && event.startedAt != null
    : blob != null &&
      markIn != null &&
      markOut != null &&
      markOut > markIn &&
      event.startedAt != null;

  const clampMs = useCallback(
    (ms: number) => {
      if (markIn == null || markOut == null) return Math.max(0, ms);
      return Math.min(markOut, Math.max(markIn, ms));
    },
    [markIn, markOut],
  );

  const seekToMs = useCallback(
    (ms: number) => {
      const video = videoRef.current;
      if (!video || markIn == null || markOut == null) return;
      const clamped = clampMs(ms);
      video.currentTime = clamped / 1000;
      setVideoMs(clamped);
    },
    [videoRef, markIn, markOut, clampMs],
  );

  // Sync UI clock from stage video; loop within Mark1…Mark2 (exclude +1s pad).
  useEffect(() => {
    if (!open) return;
    const video = videoRef.current;
    if (!video) return;

    const onTime = () => {
      if (markIn == null || markOut == null) return;
      const ms = video.currentTime * 1000;
      if (ms < markIn - 20) {
        video.currentTime = markIn / 1000;
        setVideoMs(markIn);
        return;
      }
      if (ms >= markOut) {
        video.pause();
        video.currentTime = markOut / 1000;
        setVideoMs(markOut);
        setPlaying(false);
        return;
      }
      setVideoMs(ms);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      if (markOut != null) seekToMs(markOut);
    };

    video.addEventListener("timeupdate", onTime);
    video.addEventListener("seeked", onTime);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEnded);
    return () => {
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("seeked", onTime);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnded);
    };
  }, [open, videoRef, markIn, markOut, seekToMs]);

  useEffect(() => {
    onHasResults?.(open);
  }, [open, onHasResults]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      onScrubberUrl(null);
    };
  }, [onScrubberUrl]);

  const openScrubber = useCallback(() => {
    if (isSinglePress) {
      if (!blob || presses == null || presses.length === 0) {
        setErr("Need at least one pass");
        return;
      }
    } else if (!blob || markIn == null || markOut == null) {
      setErr("Need a recording with Mark 1 and Mark 2");
      return;
    }
    if (event.startedAt == null) {
      setErr("No start time — Starter bang required");
      return;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    const url = URL.createObjectURL(blob);
    objectUrlRef.current = url;
    onScrubberUrl(url);
    onShowSnapshot?.(null);

    const next = emptyRows(event);
    // Single-press: each press seeds its lane as a manual finish draft.
    if (isSinglePress && presses) {
      const seeds = pressSeeds({
        pressesMs: presses,
        startedAt: event.startedAt,
        recServerAt,
        laneCount: next.length,
      });
      for (const s of seeds) {
        const row = next.find((r) => r.lane === s.lane);
        if (!row) continue;
        row.finishMs = s.finishMs;
        row.tapT = s.tapT;
        row.source = "manual";
        row.snapshotVideoMs = presses[s.lane - 1] ?? null;
      }
    }
    setRows(next);
    setSelectedLane(next[0]?.lane ?? 1);
    setOpen(true);
    setErr(null);
    setPlaying(false);
    setVideoMs(markIn ?? 0);
    setYoloChip("idle");
    // Kick model load immediately; scan starts in effect below (never blocks UI).
    prefetchPersonModel();

    if (!startedRef.current) {
      startedRef.current = true;
      onAnalyseStarted?.();
    }
    onStatus("Analyse");
    onLog(
      isSinglePress
        ? `Analyse single-press · ${presses?.length ?? 0} pass(es) (±0.5s buffer)`
        : `Analyse scrubber Mark1…Mark2 [${markIn}…${markOut}] ms (pad excluded)`,
    );
  }, [
    blob,
    markIn,
    markOut,
    event,
    isSinglePress,
    presses,
    recServerAt,
    onScrubberUrl,
    onShowSnapshot,
    onAnalyseStarted,
    onStatus,
    onLog,
  ]);

  // After stage <video> mounts with scrubberUrl, seek to Mark 1.
  useEffect(() => {
    if (!open || markIn == null) return;
    let cancelled = false;
    let tries = 0;
    const go = (video: HTMLVideoElement) => {
      if (cancelled) return;
      video.currentTime = markIn / 1000;
      setVideoMs(markIn);
    };
    const tryBind = () => {
      if (cancelled) return;
      const video = videoRef.current;
      if (!video) {
        if (tries++ < 45) requestAnimationFrame(tryBind);
        return;
      }
      if (video.readyState >= 1) go(video);
      else video.addEventListener("loadedmetadata", () => go(video), { once: true });
    };
    tryBind();
    return () => {
      cancelled = true;
    };
  }, [open, markIn, videoRef]);

  /**
   * Background YOLO (P1) — starts in parallel when Analyse opens.
   * Merges only via applyLaneProposal (skips Accepted / locked / manual).
   * Own video element inside analyseFinishClip — does not fight scrubber.
   */
  useEffect(() => {
    if (!open || !blob || markIn == null || markOut == null) return;
    if (event.startedAt == null) return;
    // Single-press already seeds each lane from its press; skip YOLO.
    if (isSinglePress) return;

    const runId = ++yoloRunIdRef.current;
    const ac = new AbortController();
    setYoloChip("scanning");
    setYoloProgress({ done: 0, total: 0 });

    const onProgress = (p: AnalyseProgress) => {
      if (runId !== yoloRunIdRef.current) return;
      setYoloProgress({ done: p.done, total: p.total });
      if (p.phase === "error") setYoloChip("error");
      else if (p.phase === "done") setYoloChip("done");
      else setYoloChip("scanning");
    };

    void (async () => {
      try {
        const suggestions = await analyseFinishClip({
          blob,
          markInMs: markIn,
          markOutMs: markOut,
          recServerAt,
          event: eventRef.current,
          signal: ac.signal,
          onProgress,
        });
        if (runId !== yoloRunIdRef.current) return;

        const detected = suggestions.filter(
          (s) => s.finishMs != null && s.tapT != null,
        ).length;
        setRows((prev) =>
          prev.map((row) => {
            const sug = suggestions.find((s) => s.lane === row.lane);
            if (!sug || sug.finishMs == null || sug.tapT == null) return row;
            // Manual / Accepted / locked lanes unchanged (canProposeLaneFinish).
            return applyLaneProposal(row, {
              finishMs: sug.finishMs,
              tapT: sug.tapT,
              snapshotDataUrl: sug.snapshotDataUrl,
              snapshotVideoMs: sug.snapshotVideoMs,
            });
          }),
        );
        setYoloChip("done");
        onLogRef.current(
          `YOLO done · ${detected} detection(s) → empty/unlocked lanes only`,
        );
      } catch (e) {
        if (ac.signal.aborted || runId !== yoloRunIdRef.current) return;
        const msg = e instanceof Error ? e.message : String(e);
        setYoloChip("error");
        onLogRef.current(`YOLO helper failed: ${msg}`);
      }
    })();

    return () => {
      ac.abort();
    };
    // Intentionally omit `event` — Accept updates must not re-trigger YOLO.
  }, [open, blob, markIn, markOut, recServerAt, isSinglePress]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video || markIn == null || markOut == null) return;
    if (video.paused) {
      if (video.currentTime * 1000 >= markOut - 5) {
        video.currentTime = markIn / 1000;
      }
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }, [videoRef, markIn, markOut]);

  const stepFrame = useCallback(
    (dir: -1 | 1) => {
      const video = videoRef.current;
      if (!video) return;
      video.pause();
      seekToMs(video.currentTime * 1000 + dir * FRAME_STEP_SEC * 1000);
    },
    [videoRef, seekToMs],
  );

  const setFinishHere = useCallback(() => {
    if (!event.startedAt || markIn == null) return;
    const video = videoRef.current;
    if (!video) return;
    const ms = clampMs(video.currentTime * 1000);
    /*
     * Finish-time formula — see lib/client/analyse-time.ts:
     *   tapT     = recServerAt + videoMs
     *   finishMs = max(0, tapT − startedAt)
     */
    const { finishMs, tapT } = finishTimeFromVideoMs({
      startedAt: event.startedAt,
      recServerAt,
      videoMs: ms,
    });
    const target = rows.find((r) => r.lane === selectedLane);
    if (target?.locked && target.accepted) {
      setErr(`Lane ${selectedLane}: tap Edit before re-setting`);
      return;
    }
    const snap = captureFrameJpeg(video, selectedLane, laneCount, code);
    setRows((prev) =>
      prev.map((r) => {
        if (r.lane !== selectedLane) return r;
        return {
          ...r,
          finishMs,
          tapT,
          snapshotDataUrl: snap,
          snapshotVideoMs: ms,
          source: "manual",
          locked: false,
          accepted: false,
        };
      }),
    );
    setErr(null);
    onShowSnapshot?.(null);
    onStatus(`Lane ${selectedLane} set · ${formatClock(finishMs, 2)}`);
    onLog(`Set lane ${selectedLane} @ video ${Math.round(ms)} ms → ${formatClock(finishMs, 2)}`);
  }, [
    event.startedAt,
    markIn,
    videoRef,
    clampMs,
    recServerAt,
    selectedLane,
    laneCount,
    code,
    rows,
    onShowSnapshot,
    onStatus,
    onLog,
  ]);

  function editRow(row: LaneFinishState) {
    setRows((prev) =>
      prev.map((r) =>
        r.bib === row.bib ? { ...r, locked: false, accepted: false } : r,
      ),
    );
    setSelectedLane(row.lane);
    if (row.snapshotVideoMs != null) seekToMs(row.snapshotVideoMs);
    else if (row.finishMs != null && event.startedAt != null) {
      seekToMs(
        videoMsFromFinishMs({
          startedAt: event.startedAt,
          recServerAt,
          finishMs: row.finishMs,
        }),
      );
    }
    onShowSnapshot?.(null);
    onStatus(`Editing lane ${row.lane}`);
  }

  function clearRow(row: LaneFinishState) {
    if (row.locked && row.accepted) {
      setErr(`Lane ${row.lane}: tap Edit before Clear`);
      return;
    }
    setRows((prev) =>
      prev.map((r) =>
        r.bib === row.bib
          ? {
              ...r,
              finishMs: null,
              tapT: null,
              snapshotDataUrl: null,
              snapshotVideoMs: null,
              source: "none",
              locked: false,
              accepted: false,
            }
          : r,
      ),
    );
    if (shownBib === row.bib) onShowSnapshot?.(null);
    onStatus(`Lane ${row.lane} cleared`);
  }

  function showRow(row: LaneFinishState) {
    if (!row.snapshotDataUrl) {
      if (row.snapshotVideoMs != null) {
        seekToMs(row.snapshotVideoMs);
        setSelectedLane(row.lane);
        return;
      }
      setErr(`Lane ${row.lane}: no finish frame yet — Set finish here`);
      return;
    }
    onShowSnapshot?.({
      bib: row.bib,
      lane: row.lane,
      name: row.name,
      snapshotDataUrl: row.snapshotDataUrl,
      finishMs: row.finishMs,
    });
    setSelectedLane(row.lane);
    onStatus(`Showing lane ${row.lane} finish frame`);
  }

  async function captureStillAt(videoMs: number, lane: number): Promise<string | null> {
    const video = videoRef.current;
    if (!video) return null;
    const v: HTMLVideoElement = video;
    const target = videoMs / 1000;
    if (Math.abs(v.currentTime - target) > 0.001) {
      await new Promise<void>((resolve, reject) => {
        const onSeek = () => {
          cleanup();
          resolve();
        };
        const onErr = () => {
          cleanup();
          reject(new Error("seek failed"));
        };
        function cleanup() {
          v.removeEventListener("seeked", onSeek);
          v.removeEventListener("error", onErr);
        }
        v.addEventListener("seeked", onSeek);
        v.addEventListener("error", onErr);
        v.currentTime = target;
      });
    }
    return captureFrameJpeg(v, lane, laneCount, code);
  }

  async function acceptOne(row: LaneFinishState) {
    if (!event.startedAt) return;
    if (row.finishMs == null || row.tapT == null) {
      setErr(`Lane ${row.lane}: Set finish here first`);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      // Ensure a finish-frame still for the snapshot upload (never video).
      let snap = row.snapshotDataUrl;
      if (!snap && row.snapshotVideoMs != null) {
        try {
          snap = await captureStillAt(row.snapshotVideoMs, row.lane);
        } catch {
          snap = null;
        }
      }
      const next = await acceptSprintFinish(code, row.bib, row.tapT);
      onEvent(next);
      setRows((prev) =>
        prev.map((r) =>
          r.bib === row.bib
            ? {
                ...r,
                accepted: true,
                locked: true,
                source: "manual",
                snapshotDataUrl: snap ?? r.snapshotDataUrl,
              }
            : r,
        ),
      );
      // Upload the snapped finish-line still (snapshot only, never video).
      if (snap && row.runnerId) {
        void uploadFinishSnapshot(code, row.runnerId, snap).catch((e) => {
          onLog(`snapshot upload failed: ${e instanceof Error ? e.message : e}`);
        });
      }
      onLog(`Accepted lane ${row.lane} · ${formatClock(row.finishMs, 2)}`);
      onStatus(`Lane ${row.lane} saved · Board updated`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function downloadFull() {
    if (!blob) return;
    void downloadBlob(blob, `finish-${code}-full-${Date.now()}.webm`);
    onLog("Downloaded full clip (includes +1s pad after Mark 2)");
  }

  const raceClockLabel = useMemo(() => {
    if (!event.startedAt || markIn == null) return "—";
    const { finishMs } = finishTimeFromVideoMs({
      startedAt: event.startedAt,
      recServerAt,
      videoMs: clampMs(videoMs),
    });
    return formatClock(finishMs, 2);
  }, [event.startedAt, markIn, recServerAt, videoMs, clampMs]);

  // Pre-scrubber: Analyse CTA opens scrubber immediately (no YOLO gate).
  if (!open) {
    return (
      <div className="flex flex-col gap-2">
        <BigBtn
          tone="go"
          className="w-full"
          disabled={!sliceReady}
          onClick={openScrubber}
        >
          Analyse
        </BigBtn>
        {err ? <p className="text-sm font-semibold text-stop">{err}</p> : null}
        {!sliceReady && blob ? (
          <p className="text-xs font-semibold text-dim">
            {event.startedAt == null
              ? "Waiting for Starter bang…"
              : isSinglePress
                ? "Need at least one pass"
                : "Need Mark 1 and Mark 2"}
          </p>
        ) : null}
      </div>
    );
  }

  const duration = markIn != null && markOut != null ? markOut - markIn : 0;
  const scrubValue = markIn != null ? clampMs(videoMs) - markIn : 0;

  const viewingSnapshot = shownBib != null;
  const yoloCount =
    yoloProgress.total > 0
      ? `${yoloProgress.done}/${yoloProgress.total}`
      : null;
  const yoloLine =
    yoloChip === "scanning"
      ? `YOLO scanning${yoloCount ? ` ${yoloCount}` : "…"}`
      : yoloChip === "done"
        ? `YOLO done${yoloCount ? ` ${yoloCount}` : ""}`
        : yoloChip === "error"
          ? "YOLO skipped"
          : isSinglePress
            ? "YOLO skipped · single-press"
            : "YOLO idle";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {err ? <p className="shrink-0 text-sm font-semibold text-stop">{err}</p> : null}

      {/* Orange: plain two-line status (same type), not a chip */}
      <div
        className="shrink-0 space-y-0.5 text-xs font-bold tabular-nums tracking-wide text-sand"
        role="status"
        aria-live="polite"
      >
        <p>
          {markIn != null && markOut != null
            ? `M1 ${Math.round(markIn)}ms → M2 ${Math.round(markOut)}ms`
            : "M1 — → M2 —"}
        </p>
        <p
          className={
            yoloChip === "done"
              ? "text-go"
              : yoloChip === "error"
                ? "text-stop"
                : "text-sand"
          }
        >
          {yoloLine}
        </p>
      </div>

      {/* Green: scrubber enabled on video; disabled + red cue on athlete snapshot */}
      {viewingSnapshot ? (
        <p className="shrink-0 text-sm font-bold text-stop">
          Tap preview to continue editing
        </p>
      ) : null}

      <div
        className={`shrink-0 rounded-2xl bg-panel ring-1 ring-line p-2 ${
          viewingSnapshot ? "pointer-events-none opacity-40" : ""
        }`}
        aria-disabled={viewingSnapshot}
      >
        {!viewingSnapshot ? (
          <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wider text-dim">
            <span>Mark1 → Mark2</span>
            <span className="font-mono tabular text-sand normal-case tracking-normal">
              race {raceClockLabel}
              <span className="text-dim">
                {" "}
                · vid {Math.round(clampMs(videoMs))}ms
              </span>
            </span>
          </div>
        ) : null}
        <input
          type="range"
          className="w-full accent-accent"
          min={0}
          max={Math.max(1, duration)}
          step={1}
          value={Math.min(duration, Math.max(0, scrubValue))}
          disabled={viewingSnapshot}
          onChange={(e) => {
            if (markIn == null || viewingSnapshot) return;
            seekToMs(markIn + Number(e.target.value));
          }}
        />
        <div className="mt-2 grid grid-cols-[auto_1fr_auto] items-center gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="tap rounded-lg bg-panel2 px-2.5 py-1.5 text-sm font-bold ring-1 ring-line"
              aria-label="Previous frame"
              disabled={viewingSnapshot}
              onClick={() => stepFrame(-1)}
            >
              ←
            </button>
            <button
              type="button"
              className="tap rounded-lg bg-panel2 px-3 py-1.5 text-sm font-bold ring-1 ring-line"
              aria-label={playing ? "Pause" : "Play"}
              disabled={viewingSnapshot}
              onClick={togglePlay}
            >
              {playing ? "Pause" : "Play"}
            </button>
            <button
              type="button"
              className="tap rounded-lg bg-panel2 px-2.5 py-1.5 text-sm font-bold ring-1 ring-line"
              aria-label="Next frame"
              disabled={viewingSnapshot}
              onClick={() => stepFrame(1)}
            >
              →
            </button>
          </div>
          <button
            type="button"
            className="tap grid shrink-0 place-items-center rounded-lg bg-accent/25 px-2.5 py-1.5 text-xs font-bold text-accent ring-1 ring-accent/60 disabled:opacity-40"
            aria-label={`Lane ${selectedLane}, tap to switch lane`}
            disabled={viewingSnapshot || rows.length === 0}
            onClick={() => {
              if (rows.length === 0) return;
              const idx = rows.findIndex((r) => r.lane === selectedLane);
              const next = rows[(idx + 1) % rows.length] ?? rows[0];
              if (!next) return;
              setSelectedLane(next.lane);
              onShowSnapshot?.(null);
            }}
          >
            <span className="inline-flex items-center gap-1 tabular-nums">
              <span>L{selectedLane}</span>
              <span aria-hidden>⇌</span>
            </span>
          </button>
          <button
            type="button"
            className="tap shrink-0 rounded-lg bg-go/20 px-2.5 py-1.5 text-xs font-bold text-go ring-1 ring-go/50 disabled:opacity-40"
            disabled={busy || !event.startedAt || viewingSnapshot}
            onClick={setFinishHere}
          >
            Set finish here
          </button>
        </div>
      </div>

      {/* Purple: per-person ranks / records (fills space where WebM + Show video were) */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-2xl ring-1 ring-line">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-panel text-[10px] font-bold uppercase tracking-wider text-dim">
            <tr>
              <th className="w-8 px-1 py-2 text-center sm:w-10 sm:px-2">L</th>
              <th className="w-12 px-1 py-2 sm:w-14">Thumb</th>
              <th className="px-2 py-2">Athlete</th>
              <th className="min-w-[4.5rem] px-1 py-2 sm:px-2">Time</th>
              <th className="w-0 px-1 py-2 whitespace-nowrap sm:px-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const showing = shownBib === r.bib;
              return (
                <tr
                  key={r.bib}
                  className={`border-t border-line/60${showing ? " bg-accent/10" : ""}${
                    selectedLane === r.lane ? " bg-sand/5" : ""
                  }`}
                >
                  <td
                    className="cursor-pointer px-1 py-2 text-center font-mono font-bold sm:px-2"
                    onClick={() => {
                      setSelectedLane(r.lane);
                      showRow(r);
                    }}
                  >
                    {r.lane}
                  </td>
                  <td className="px-1 py-1.5 sm:px-2">
                    {r.snapshotDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.snapshotDataUrl}
                        alt={`Lane ${r.lane}`}
                        className="h-10 w-12 cursor-pointer rounded object-cover ring-1 ring-line"
                        onClick={() => showRow(r)}
                      />
                    ) : (
                      <div className="grid h-10 w-12 place-items-center rounded bg-void text-[10px] text-dim ring-1 ring-line">
                        —
                      </div>
                    )}
                  </td>
                  <td
                    className="cursor-pointer px-2 py-2"
                    onClick={() => {
                      setSelectedLane(r.lane);
                      showRow(r);
                    }}
                  >
                    <div className="truncate font-semibold">{r.name || "—"}</div>
                    <div className="text-[10px] text-dim">
                      {r.source === "manual"
                        ? "manual"
                        : r.source === "yolo"
                          ? "YOLO"
                          : "—"}
                      {r.accepted ? " · saved" : ""}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-1 py-2 font-mono tabular sm:px-2">
                    {r.finishMs != null ? formatClock(r.finishMs, 2) : "—"}
                  </td>
                  <td className="w-0 px-1 py-2 whitespace-nowrap sm:px-2">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        className="rounded-lg bg-panel px-2 py-1 text-xs font-bold ring-1 ring-line disabled:opacity-40"
                        disabled={
                          busy ||
                          viewingSnapshot ||
                          (r.finishMs == null && !r.accepted)
                        }
                        onClick={() => editRow(r)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="rounded-lg bg-panel px-2 py-1 text-xs font-bold ring-1 ring-line disabled:opacity-40"
                        disabled={
                          busy ||
                          viewingSnapshot ||
                          r.finishMs == null ||
                          (r.locked && r.accepted)
                        }
                        onClick={() => clearRow(r)}
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        className="rounded-lg bg-go/20 px-2 py-1 text-xs font-bold text-go ring-1 ring-go/50 disabled:opacity-40"
                        disabled={
                          busy ||
                          viewingSnapshot ||
                          r.finishMs == null ||
                          r.accepted
                        }
                        onClick={() => void acceptOne(r)}
                      >
                        Accept
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
