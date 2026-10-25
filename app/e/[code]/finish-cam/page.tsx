"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { PinGate } from "@/components/pin-gate";
import { ResetIcon } from "@/components/reset-icon";
import { BigBtn, ICON_BTN, RESET_ICON_BTN, Screen, TopBar } from "@/components/shell";
import { EmptyState, LoadingState } from "@/components/states";
import {
  FinishAnalysePanel,
  type FinishSnapshotPreview,
} from "@/components/finish-analyse";
import { LaneGuidesOverlay } from "@/components/lane-guides";
import { sprintersForAnalyse } from "@/lib/client/analyse-lanes";
import { formatClock } from "@/lib/format";
import {
  applyHardwareZoom,
  BANG_SOUNDTRACK_TODO,
  exitFullscreenUnlockOrientation,
  openFinishStream,
  clipExtFromMime,
  makeGalleryFriendlyClip,
  pickRecorderMime,
  readZoomCaps,
  startZoomPipeline,
  stopStream,
  toggleStageFullscreen,
  YOLO_SLICE_NOTE,
  type FinishCamMeta,
  type ZoomCaps,
} from "@/lib/client/finish-cam";
import { useHardwareKeys } from "@/lib/client/hardware-keys";
import {
  loadMarkMode,
  saveMarkMode,
  SINGLE_PRESS_BUFFER_MS,
  singlePressEndVideoMs,
  type MarkMode,
} from "@/lib/client/mark-mode";
import { downloadBlob } from "@/lib/client/analyse-finish";
import { json, useEvent } from "@/lib/client/hooks";
import { hapticHoldOk, hapticTap } from "@/lib/haptic";
import type { EventState } from "@/lib/types";

/**
 * Sprint-only Finish Cam helper.
 * Recording marks are local video offsets; Analyse opens a manual scrubber
 * (Mark1…Mark2) to Set/Accept per-lane finishes. YOLO is a later helper only.
 */
export default function FinishCamPage() {
  const { code } = useParams<{ code: string }>();
  return (
    <PinGate code={code}>
      <FinishCamInner code={code} />
    </PinGate>
  );
}

type Phase = "boot" | "recording" | "ended" | "error";

function FinishCamInner({ code }: { code: string }) {
  const { event, error, serverNow, setEvent, refresh } = useEvent(code, 4000);
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  /** Scrubber playback on the stage after Analyse opens. */
  const scrubVideoRef = useRef<HTMLVideoElement>(null);
  const previewHostRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const pipelineStopRef = useRef<(() => void) | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recStartedPerfRef = useRef(0);
  const recServerAtRef = useRef(0);
  const markInRef = useRef<number | null>(null);
  const markOutRef = useRef<number | null>(null);
  /** Single-press mode: video offsets (ms) of each passer, in lane order. */
  const pressesRef = useRef<number[]>([]);
  const stoppingRef = useRef(false);
  const blobRef = useRef<Blob | null>(null);
  const metaRef = useRef<FinishCamMeta | null>(null);
  const zoomValueRef = useRef(1);
  const serverNowRef = useRef(serverNow);
  serverNowRef.current = serverNow;

  const [phase, setPhase] = useState<Phase>("boot");
  const [status, setStatus] = useState("Warming camera…");
  const [stageFullscreen, setStageFullscreen] = useState(false);
  const [zoom, setZoom] = useState<ZoomCaps | null>(null);
  const [markInMs, setMarkInMs] = useState<number | null>(null);
  const [markOutMs, setMarkOutMs] = useState<number | null>(null);
  const [pressesMs, setPressesMs] = useState<number[]>([]);
  const [markMode, setMarkMode] = useState<MarkMode>(() => loadMarkMode(code));
  const [analyseShow, setAnalyseShow] = useState(false);
  /** True once Analyse is tapped — locks reset, swaps TopBar to download. */
  const [analyseStarted, setAnalyseStarted] = useState(false);
  const [analyseHasResults, setAnalyseHasResults] = useState(false);
  /** Lane finish-frame shown on the preview stage after Analyse → Show. */
  const [snapshotPreview, setSnapshotPreview] = useState<FinishSnapshotPreview | null>(
    null,
  );
  /** Object URL for Mark1…Mark2 scrubber video on the stage. */
  const [scrubberUrl, setScrubberUrl] = useState<string | null>(null);
  const [clipBlob, setClipBlob] = useState<Blob | null>(null);
  const [clipMeta, setClipMeta] = useState<FinishCamMeta | null>(null);
  const [stopping, setStopping] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  /** Camera width/height — sizes preview frame with object-contain in both axes. */
  const [previewAr, setPreviewAr] = useState<number | null>(null);
  const sessionKickRef = useRef(false);

  const pushLog = useCallback((msg: string) => {
    console.debug(msg);
  }, []);

  useEffect(() => {
    function onFs() {
      setStageFullscreen(!!document.fullscreenElement);
    }
    onFs();
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // Reload the persisted mode when the event code changes (client nav keeps this component alive).
  useEffect(() => {
    setMarkMode(loadMarkMode(code));
  }, [code]);

  const teardown = useCallback(() => {
    try {
      if (recorderRef.current && recorderRef.current.state === "recording") {
        recorderRef.current.stop();
      }
    } catch {
      /* ignore */
    }
    recorderRef.current = null;
    pipelineStopRef.current?.();
    pipelineStopRef.current = null;
    const host = previewHostRef.current;
    if (host) {
      for (const node of Array.from(host.querySelectorAll("canvas"))) node.remove();
    }
    stopStream(streamRef.current);
    streamRef.current = null;
    trackRef.current = null;
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  const startSession = useCallback(async () => {
    setCamError(null);
    setPhase("boot");
    setStatus("Warming camera…");
    setAnalyseShow(false);
    setAnalyseStarted(false);
    setAnalyseHasResults(false);
    setSnapshotPreview(null);
    setScrubberUrl(null);
    setMarkInMs(null);
    setMarkOutMs(null);
    setPressesMs([]);
    setStopping(false);
    markInRef.current = null;
    markOutRef.current = null;
    pressesRef.current = [];
    stoppingRef.current = false;
    blobRef.current = null;
    metaRef.current = null;
    setClipBlob(null);
    setClipMeta(null);
    chunksRef.current = [];
    setPreviewAr(null);

    try {
      // Portrait and landscape both work; no forced orientation lock.
      teardown();
      const { stream, track } = await openFinishStream();
      streamRef.current = stream;
      trackRef.current = track;

      const video = videoRef.current;
      if (!video) throw new Error("Video element missing");
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      // Wait a tick for videoWidth/Height on some devices.
      await new Promise((r) => requestAnimationFrame(() => r(undefined)));

      const vw = video.videoWidth || 1280;
      const vh = video.videoHeight || 720;
      setPreviewAr(vw / vh);

      const caps = readZoomCaps(track);
      zoomValueRef.current = caps.value;
      setZoom(caps);

      let recordStream: MediaStream = stream;
      if (caps.mode === "digital") {
        const pipe = startZoomPipeline(video, stream, zoomValueRef);
        pipelineStopRef.current = pipe.stop;
        recordStream = pipe.recordStream;
        const host = previewHostRef.current;
        if (host) {
          // Fill the AR frame only (frame already matches camera) — no stage stretch
          pipe.canvas.className = "absolute inset-0 h-full w-full";
          host.replaceChildren(pipe.canvas);
        }
        video.classList.add("hidden");
      } else {
        video.classList.remove("hidden");
        const host = previewHostRef.current;
        if (host) host.replaceChildren();
        try {
          await applyHardwareZoom(track, caps.value);
        } catch {
          /* some devices list zoom but reject apply */
        }
      }

      const mime = pickRecorderMime();
      const opts: MediaRecorderOptions = mime
        ? { mimeType: mime, videoBitsPerSecond: 6_000_000 }
        : { videoBitsPerSecond: 6_000_000 };
      const recorder = new MediaRecorder(recordStream, opts);
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const markIn = markInRef.current;
        const markOut = markOutRef.current;
        const presses = [...pressesRef.current];
        const rawBlob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "video/webm",
        });
        const durationMs = performance.now() - recStartedPerfRef.current;
        const lastPress = presses.length
          ? Math.round(presses[presses.length - 1]!)
          : null;
        const meta: FinishCamMeta = {
          recServerAt: recServerAtRef.current,
          markInMs: markIn,
          markOutMs: markOut,
          // No post-Mark2 pad. Single-press keeps only the ±0.5s buffer.
          analyseEndMs:
            markOut != null
              ? markOut
              : lastPress != null
                ? lastPress + SINGLE_PRESS_BUFFER_MS
                : durationMs,
          durationMs,
          pressesMs: presses.length ? presses : null,
          note: `${BANG_SOUNDTRACK_TODO}. ${YOLO_SLICE_NOTE}.`,
        };
        metaRef.current = meta;
        // Rebuild WebM Duration+Cues so Android Gallery shows real length and can scrub.
        void (async () => {
          let blob = rawBlob;
          try {
            blob = await makeGalleryFriendlyClip(rawBlob);
          } catch (e) {
            console.debug(
              `webm seekable fix skipped: ${e instanceof Error ? e.message : e}`,
            );
          }
          blobRef.current = blob;
          setClipBlob(blob);
          setClipMeta(meta);
          setPhase("ended");
          setStatus("Stopped · RACE END");
          setAnalyseShow(true);
        })();
      };

      // One GET ping right before Record: `recServerAt` must land in the same
      // server-ms domain as Starter's `startedAt`, not the device wall clock.
      const freshServerNow = await refresh();
      if (freshServerNow != null) serverNowRef.current = freshServerNow;
      recStartedPerfRef.current = performance.now();
      recServerAtRef.current = serverNowRef.current || Date.now();
      // No timeslice: chunked WebM omits Duration (Gallery shows ~1s). Cues still added on stop.
      recorder.start();
      setPhase("recording");
      setStatus("Recording…");
    } catch (e) {
      setPhase("error");
      const msg = e instanceof Error ? e.message : String(e);
      setCamError(msg);
      setStatus("Camera error");
      console.debug(msg);
    }
  }, [teardown, refresh]);

  useEffect(() => {
    if (!event || event.kind !== "sprint") return;
    if (sessionKickRef.current) return;
    sessionKickRef.current = true;
    void startSession();
  }, [event, startSession]);

  /** POST the race end (server ms). Mark 2 / single-press stop — not Analyse. */
  const endRaceClock = useCallback(
    (videoMs: number) => {
      const recAt = recServerAtRef.current;
      const endedAt = recAt > 0 ? Math.round(recAt + videoMs) : null;
      if (endedAt == null) return;
      void json<{ event: EventState }>(`/api/events/${code}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "finished", endedAt }),
      })
        .then((data) => {
          setEvent(data.event);
          pushLog(`Race clock ended · endedAt ${endedAt}`);
        })
        .catch((e) => {
          console.debug(
            `end-race failed: ${e instanceof Error ? e.message : e}`,
          );
        });
    },
    [code, setEvent, pushLog],
  );

  function stopRecorderNow() {
    try {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    } catch {
      /* ignore */
    }
    pipelineStopRef.current?.();
    pipelineStopRef.current = null;
    stopStream(streamRef.current);
    streamRef.current = null;
    trackRef.current = null;
  }

  function onMark1() {
    // Wait for Starter bang — same running gate as Timer (`status` + `startedAt`).
    if (!event || event.status !== "running" || event.startedAt == null) return;
    if (phase !== "recording" || recorderRef.current?.state !== "recording") return;
    if (markInRef.current != null) return;
    const ms = Math.round(performance.now() - recStartedPerfRef.current);
    markInRef.current = ms;
    setMarkInMs(ms);
    setStatus(`Mark 1 @ ${ms} ms`);
    hapticTap();
  }

  function onMark2() {
    if (phase !== "recording" || recorderRef.current?.state !== "recording") return;
    if (markInRef.current == null || markOutRef.current != null || stoppingRef.current) return;
    const ms = Math.round(performance.now() - recStartedPerfRef.current);
    markOutRef.current = ms;
    setMarkOutMs(ms);
    setStatus(`Mark 2 @ ${ms} ms`);
    stoppingRef.current = true;
    setStopping(true);
    hapticHoldOk();
    // Race clock ends at Mark 2 (server ms).
    endRaceClock(ms);
    // Stop recording immediately — no post-Mark2 wait/pad.
    stopRecorderNow();
  }

  function onPress() {
    if (!event || event.status !== "running" || event.startedAt == null) return;
    if (phase !== "recording" || recorderRef.current?.state !== "recording") return;
    if (stoppingRef.current) return;
    const ms = Math.round(performance.now() - recStartedPerfRef.current);
    pressesRef.current.push(ms);
    setPressesMs([...pressesRef.current]);
    setStatus(`Passer ${pressesRef.current.length} @ ${ms} ms`);
    hapticTap();
  }

  async function stopSinglePress() {
    if (phase !== "recording" || recorderRef.current?.state !== "recording") return;
    if (stoppingRef.current) return;
    if (pressesRef.current.length === 0) return;
    const ms = Math.round(performance.now() - recStartedPerfRef.current);
    stoppingRef.current = true;
    setStopping(true);
    hapticHoldOk();
    // Race clock ends at the last passer's press (fallback: now).
    endRaceClock(singlePressEndVideoMs(pressesRef.current, ms));
    // Keep only the ±0.5s Analyse buffer after the last press, then stop.
    const last = pressesRef.current[pressesRef.current.length - 1]!;
    const delay = Math.max(0, last + SINGLE_PRESS_BUFFER_MS - ms);
    if (delay > 0) {
      await new Promise((r) => setTimeout(r, delay));
      if (recorderRef.current?.state !== "recording") return;
    }
    stopRecorderNow();
  }

  /** Hardware Space/Enter drives marks in both modes — soft keyboard not required. */
  useHardwareKeys((e) => {
    if (phase !== "recording") return false;
    const k = e.key;
    if (k !== " " && k !== "Spacebar" && k !== "Enter") return false;
    if (e.repeat) return false;
    if (markMode === "two-press") {
      if (markInRef.current == null) {
        onMark1();
        return true;
      }
      if (markOutRef.current == null && !stoppingRef.current) {
        onMark2();
        return true;
      }
      return false;
    }
    // single-press: Space logs each passer.
    if (!stoppingRef.current) {
      onPress();
      return true;
    }
    return false;
  });

  function setMarkModeUI(mode: MarkMode) {
    saveMarkMode(code, mode);
    setMarkMode(mode);
  }

  async function onZoom(v: number) {
    if (!zoom) return;
    zoomValueRef.current = v;
    setZoom({ ...zoom, value: v });
    if (zoom.mode === "hardware") {
      try {
        await applyHardwareZoom(trackRef.current, v);
      } catch (e) {
        console.debug(`zoom error: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  async function onToggleFullscreen() {
    await toggleStageFullscreen(stageRef.current);
    setStageFullscreen(!!document.fullscreenElement);
  }

  const onAnalyseStarted = useCallback(() => {
    setAnalyseStarted(true);
    // Race clock is already ended at Mark 2 / single-press stop — Analyse is
    // review-only and must not move the clock.
    void exitFullscreenUnlockOrientation().then(() => {
      setStageFullscreen(!!document.fullscreenElement);
    });
  }, []);

  if (error === "missing") {
    return (
      <Screen>
        <TopBar backHref="/" title="Missing" />
        <EmptyState title="No event" hint="That code is missing or expired." />
        <div className="px-4 pb-8">
          <BigBtn href="/" tone="plain" className="w-full">
            Home
          </BigBtn>
        </div>
      </Screen>
    );
  }

  if (!event) {
    return (
      <Screen className="max-w-none">
        <TopBar backHref={`/e/${code}/help`} title="Finish Cam" />
        <LoadingState rows={3} />
      </Screen>
    );
  }

  if (event.kind !== "sprint") {
    return (
      <Screen>
        <TopBar backHref={`/e/${code}/help`} title="Finish Cam" />
        <EmptyState
          title="Sprint only"
          hint="Finish Cam is for sprint events. Use Marker for distance time trials."
        />
        <div className="flex flex-col gap-2 px-4 pb-8">
          <BigBtn href={`/e/${code}/marker`} tone="plain" className="w-full">
            Open Marker
          </BigBtn>
          <BigBtn href={`/e/${code}/help`} tone="accent" className="w-full">
            Helper hub
          </BigBtn>
        </div>
      </Screen>
    );
  }

  // Match Timer/Starter: Mark 1 only after Starter sets server `startedAt`.
  const running = event.status === "running" && event.startedAt != null;
  const canMark1 = running && phase === "recording" && markInMs == null;
  const canMark2 =
    phase === "recording" && markInMs != null && markOutMs == null && !stopping;
  const canPress = running && phase === "recording" && !stopping;
  const canStopSingle = phase === "recording" && pressesMs.length > 0 && !stopping;
  const statusLine =
    phase === "recording" && !running && markInMs == null && pressesMs.length === 0
      ? "Waiting for start…"
      : status;
  /** Calibrated lane bands — same count Analyse / YOLO will use. */
  const laneGuideCount = Math.max(1, sprintersForAnalyse(event).length);

  // recording → fullscreen; race end → alert Reset only (NO download).
  // After Analyse → download outer top-right (Reset hides).
  const showDownload = Boolean(clipBlob) && analyseStarted;
  const showReset =
    !analyseStarted && (phase === "ended" || phase === "error");
  const showRaceEndOverlay = phase === "ended" && !analyseStarted;

  function downloadFullClip() {
    if (!clipBlob) return;
    const ext = clipExtFromMime(clipBlob.type);
    void downloadBlob(clipBlob, `finish-${code}-full-${Date.now()}.${ext}`);
    pushLog(`Downloaded full clip (.${ext}, no post-Mark2 pad)`);
  }

  return (
    <Screen className="h-dvh max-h-dvh max-w-none overflow-hidden">
      <div
        ref={stageRef}
        className="flex min-h-0 flex-1 flex-col bg-void [:fullscreen]:h-dvh [:fullscreen]:w-screen"
      >
        <TopBar
          className="!mb-1"
          backHref={`/e/${code}/help`}
          title="Finish Cam"
          extra={
            <>
              {showReset ? (
                <button
                  type="button"
                  className={RESET_ICON_BTN}
                  aria-label={phase === "error" ? "Reset" : "Record again"}
                  onClick={() => void startSession()}
                >
                  <ResetIcon />
                </button>
              ) : null}
              {showDownload ? (
                <button
                  type="button"
                  className={ICON_BTN}
                  aria-label={
                    clipBlob
                      ? `Download as ${clipExtFromMime(clipBlob.type).toUpperCase()}`
                      : "Download clip"
                  }
                  disabled={!clipBlob}
                  onClick={downloadFullClip}
                  title={
                    clipBlob
                      ? `Download as ${clipExtFromMime(clipBlob.type).toUpperCase()}`
                      : "Download"
                  }
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                    <path
                      d="M9 2v10M5 8l4 4 4-4M3 15h12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              ) : null}
              {/* No fullscreen control while Analyse / editing — avoids accidental FS + system toast */}
              {!analyseStarted && !showReset ? (
                <button
                  type="button"
                  className={ICON_BTN}
                  aria-label={stageFullscreen ? "Exit full screen" : "Full screen"}
                  onClick={() => void onToggleFullscreen()}
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                    <path
                      d="M2 6V2h4M12 2h4v4M16 12v4h-4M6 16H2v-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              ) : null}
            </>
          }
          info="Finish camera — portrait or landscape. Continuous record. Two-press: Mark 1 enter / Mark 2 exit (Space advances). Single-press: one press per sprinter (Space logs each). Mark 2 / stop ends the race clock; Analyse is review only."
        />

        <div
          className="relative mx-3 mt-0 min-h-0 flex-1 overflow-hidden rounded-2xl bg-black ring-1 ring-line"
          style={{ containerType: "size" }}
        >
          {/* object-contain both axes: min(stageW, stageH×ar) × min(stageH, stageW/ar), centered */}
          <div className="absolute inset-0 flex items-center justify-center">
            {snapshotPreview ? (
              <div className="relative flex h-full w-full items-center justify-center">
                {/* Finish-frame snapshot: red line (+ YOLO box later) baked into JPEG */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={snapshotPreview.snapshotDataUrl}
                  alt={`Lane ${snapshotPreview.lane} finish frame`}
                  className="max-h-full max-w-full cursor-pointer object-contain"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    const ms = snapshotPreview.snapshotVideoMs;
                    setSnapshotPreview(null);
                    if (ms != null && scrubVideoRef.current) {
                      scrubVideoRef.current.currentTime = ms / 1000;
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      const ms = snapshotPreview.snapshotVideoMs;
                      setSnapshotPreview(null);
                      if (ms != null && scrubVideoRef.current) {
                        scrubVideoRef.current.currentTime = ms / 1000;
                      }
                    }
                  }}
                />
                <div className="pointer-events-none absolute top-3 left-3 z-[3] rounded-lg border border-line bg-black/75 px-2.5 py-1.5 text-xs font-bold tracking-wide text-sand">
                  Lane {snapshotPreview.lane}
                  {snapshotPreview.finishMs != null
                    ? ` · ${formatClock(snapshotPreview.finishMs, 2)}`
                    : ""}
                </div>
              </div>
            ) : scrubberUrl ? (
              <div className="relative flex h-full w-full items-center justify-center">
                <div className="relative inline-flex max-h-full max-w-full">
                  <video
                    ref={scrubVideoRef}
                    src={scrubberUrl}
                    playsInline
                    muted
                    preload="auto"
                    className="block max-h-[100cqh] max-w-[100cqw] object-contain"
                  />
                  {/* Agent 2 lane guides — consume overlay; geometry owned by lane-guides */}
                  <LaneGuidesOverlay
                    eventCode={code}
                    laneCount={laneGuideCount}
                  />
                  <div
                    className="pointer-events-none absolute inset-y-0 left-1/2 z-[2] w-[3px] -translate-x-1/2 bg-stop shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
                    aria-hidden
                  />
                  <div className="pointer-events-none absolute top-3 left-[calc(50%+10px)] z-[3] rounded-lg border border-stop bg-[#7f1d1d]/90 px-2.5 py-1.5 text-xs font-bold tracking-wide text-[#fecaca]">
                    Finishing Line
                  </div>
                </div>
              </div>
            ) : (
              <div
                className="relative"
                style={
                  previewAr != null
                    ? {
                        aspectRatio: String(previewAr),
                        width: `min(100cqw, ${previewAr} * 100cqh)`,
                        maxHeight: "100cqh",
                      }
                    : { width: "100%", height: "100%" }
                }
              >
                <div ref={previewHostRef} className="absolute inset-0" />
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  className="absolute inset-0 h-full w-full object-contain"
                />
                <LaneGuidesOverlay
                  eventCode={code}
                  laneCount={laneGuideCount}
                />
                <div
                  className="pointer-events-none absolute inset-y-0 left-1/2 z-[2] w-[3px] -translate-x-1/2 bg-stop shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
                  aria-hidden
                />
                <div className="pointer-events-none absolute top-3 left-[calc(50%+10px)] z-[3] rounded-lg border border-stop bg-[#7f1d1d]/90 px-2.5 py-1.5 text-xs font-bold tracking-wide text-[#fecaca]">
                  Finishing Line
                </div>
              </div>
            )}
          </div>
          {showRaceEndOverlay ? (
            <div className="pointer-events-none absolute inset-0 z-[4] flex items-center justify-center bg-black/55">
              <div className="text-[clamp(2.5rem,8cqw,3.75rem)] font-black tracking-[0.08em] sm:text-6xl">
                RACE END
              </div>
            </div>
          ) : null}
        </div>

        <div
          className={`flex flex-col gap-2 px-3 pb-[max(12px,env(safe-area-inset-bottom))] ${analyseShow ? "pt-2" : "pt-3"} ${
            analyseHasResults ? "min-h-0 flex-1" : "shrink-0"
          }`}
        >
          {!analyseShow ? (
            <div className="flex shrink-0 items-center justify-between gap-2 text-xs font-bold uppercase tracking-wider text-dim">
              <span>{statusLine}</span>
              <span className="font-mono tabular text-sand">
                {markMode === "single-press"
                  ? `${pressesMs.length} pass${pressesMs.length === 1 ? "" : "es"}`
                  : `${markInMs != null ? `M1 ${markInMs}ms` : "—"} · ${
                      markOutMs != null ? `M2 ${markOutMs}ms` : "—"
                    }`}
              </span>
            </div>
          ) : null}

          {zoom && !analyseShow ? (
            <label className="block shrink-0 text-xs font-bold uppercase tracking-wider text-dim">
              Zoom {zoom.value.toFixed(1)}×
              {zoom.mode === "digital" ? " · digital" : ""}
              <input
                type="range"
                className="mt-1 w-full accent-accent"
                min={zoom.min}
                max={zoom.max}
                step={zoom.step}
                value={zoom.value}
                disabled={phase !== "recording" && phase !== "boot"}
                onChange={(e) => void onZoom(Number(e.target.value))}
              />
            </label>
          ) : null}

          {/* Same slot: Marks while recording · Analyse after RACE END */}
          {analyseShow ? (
            <FinishAnalysePanel
              code={code}
              event={event}
              blob={clipBlob}
              meta={clipMeta}
              markInMs={markInMs}
              markOutMs={markOutMs}
              videoRef={scrubVideoRef}
              onScrubberUrl={setScrubberUrl}
              onEvent={setEvent}
              onLog={pushLog}
              onStatus={setStatus}
              onAnalyseStarted={onAnalyseStarted}
              onHasResults={setAnalyseHasResults}
              onShowSnapshot={setSnapshotPreview}
              shownBib={snapshotPreview?.bib ?? null}
            />
          ) : (
            <div className="flex flex-col gap-2">
              {/* Mark mode: switchable until first Mark/press (recording alone must not lock it). */}
              <div
                className="grid shrink-0 grid-cols-2 gap-1 rounded-xl bg-panel2 p-1 ring-1 ring-line"
                role="tablist"
                aria-label="Mark mode"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={markMode === "two-press"}
                  disabled={
                    markInMs != null ||
                    markOutMs != null ||
                    pressesMs.length > 0 ||
                    stopping
                  }
                  className={`tap rounded-lg px-2 py-1.5 text-xs font-black uppercase tracking-wide ring-1 ${
                    markMode === "two-press"
                      ? "bg-accent text-ink ring-accent/60"
                      : "bg-transparent text-dim ring-transparent"
                  }`}
                  onClick={() => setMarkModeUI("two-press")}
                >
                  A · Two-press
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={markMode === "single-press"}
                  disabled={
                    markInMs != null ||
                    markOutMs != null ||
                    pressesMs.length > 0 ||
                    stopping
                  }
                  className={`tap rounded-lg px-2 py-1.5 text-xs font-black uppercase tracking-wide ring-1 ${
                    markMode === "single-press"
                      ? "bg-accent text-ink ring-accent/60"
                      : "bg-transparent text-dim ring-transparent"
                  }`}
                  onClick={() => setMarkModeUI("single-press")}
                >
                  B · Single-press
                </button>
              </div>

              {markMode === "two-press" ? (
                <div className="grid grid-cols-2 gap-2">
                  <BigBtn tone="plain" className="w-full" disabled={!canMark1} onClick={onMark1}>
                    Mark 1 · enter
                  </BigBtn>
                  <BigBtn
                    tone="danger"
                    className="w-full"
                    disabled={!canMark2}
                    onClick={() => onMark2()}
                  >
                    Mark 2 · exit
                  </BigBtn>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <BigBtn tone="plain" className="w-full" disabled={!canPress} onClick={onPress}>
                    Mark passer
                  </BigBtn>
                  <BigBtn
                    tone="danger"
                    className="w-full"
                    disabled={!canStopSingle}
                    onClick={() => void stopSinglePress()}
                  >
                    Stop
                  </BigBtn>
                </div>
              )}
            </div>
          )}

          {camError ? <p className="text-sm font-semibold text-stop">{camError}</p> : null}
        </div>
      </div>
    </Screen>
  );
}
