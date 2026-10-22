"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { PinGate } from "@/components/pin-gate";
import { BigBtn, ICON_BTN, Screen, TopBar } from "@/components/shell";
import { EmptyState, LoadingState } from "@/components/states";
import {
  FinishAnalysePanel,
  type FinishSnapshotPreview,
} from "@/components/finish-analyse";
import { formatClock } from "@/lib/format";
import {
  applyHardwareZoom,
  BANG_SOUNDTRACK_TODO,
  exitFullscreenUnlockOrientation,
  isLandscape,
  openFinishStream,
  pickRecorderMime,
  readZoomCaps,
  startZoomPipeline,
  stopStream,
  toggleStageFullscreen,
  tryLockLandscape,
  YOLO_SLICE_NOTE,
  type FinishCamMeta,
  type ZoomCaps,
} from "@/lib/client/finish-cam";
import { downloadBlob } from "@/lib/client/analyse-finish";
import { useEvent } from "@/lib/client/hooks";

/**
 * Sprint-only Finish Cam helper.
 * Recording marks are local video offsets; Analyse runs in-app YOLO then writes per-lane finishes.
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
  const { event, error, serverNow, setEvent } = useEvent(code, 4000);
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
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
  const stoppingRef = useRef(false);
  const blobRef = useRef<Blob | null>(null);
  const metaRef = useRef<FinishCamMeta | null>(null);
  const zoomValueRef = useRef(1);
  const serverNowRef = useRef(serverNow);
  serverNowRef.current = serverNow;

  const [phase, setPhase] = useState<Phase>("boot");
  const [status, setStatus] = useState("Warming camera…");
  const [landscape, setLandscape] = useState(true);
  const [stageFullscreen, setStageFullscreen] = useState(false);
  const [zoom, setZoom] = useState<ZoomCaps | null>(null);
  const [markInMs, setMarkInMs] = useState<number | null>(null);
  const [markOutMs, setMarkOutMs] = useState<number | null>(null);
  const [analyseShow, setAnalyseShow] = useState(false);
  /** True once Analyse is tapped — locks reset, swaps TopBar to download. */
  const [analyseStarted, setAnalyseStarted] = useState(false);
  const [analyseHasResults, setAnalyseHasResults] = useState(false);
  /** Lane finish-frame shown on the preview stage after Analyse → Show. */
  const [snapshotPreview, setSnapshotPreview] = useState<FinishSnapshotPreview | null>(
    null,
  );
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
    function check() {
      setLandscape(isLandscape());
    }
    function onFs() {
      setStageFullscreen(!!document.fullscreenElement);
    }
    check();
    onFs();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, []);

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
    setMarkInMs(null);
    setMarkOutMs(null);
    setStopping(false);
    markInRef.current = null;
    markOutRef.current = null;
    stoppingRef.current = false;
    blobRef.current = null;
    metaRef.current = null;
    setClipBlob(null);
    setClipMeta(null);
    chunksRef.current = [];
    setPreviewAr(null);

    try {
      // Orientation only — do not require document fullscreen for live preview.
      await tryLockLandscape();
      setLandscape(isLandscape());

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
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "video/webm",
        });
        blobRef.current = blob;
        const meta: FinishCamMeta = {
          recServerAt: recServerAtRef.current,
          markInMs: markIn,
          markOutMs: markOut,
          analyseEndMs: markOut != null ? markOut + 1000 : null,
          durationMs: performance.now() - recStartedPerfRef.current,
          note: `${BANG_SOUNDTRACK_TODO}. ${YOLO_SLICE_NOTE}.`,
        };
        metaRef.current = meta;
        setClipBlob(blob);
        setClipMeta(meta);
        setPhase("ended");
        setStatus("Stopped · RACE END");
        setAnalyseShow(true);
      };

      recStartedPerfRef.current = performance.now();
      recServerAtRef.current = serverNowRef.current || Date.now();
      recorder.start(250);
      setPhase("recording");
      setStatus("Recording…");
    } catch (e) {
      setPhase("error");
      const msg = e instanceof Error ? e.message : String(e);
      setCamError(msg);
      setStatus("Camera error");
      console.debug(msg);
    }
  }, [teardown]);

  useEffect(() => {
    if (!event || event.kind !== "sprint") return;
    if (sessionKickRef.current) return;
    sessionKickRef.current = true;
    void startSession();
  }, [event, startSession]);

  function onMark1() {
    // Wait for Starter bang — same running gate as Timer (`status` + `startedAt`).
    if (!event || event.status !== "running" || event.startedAt == null) return;
    if (phase !== "recording" || recorderRef.current?.state !== "recording") return;
    if (markInRef.current != null) return;
    const ms = Math.round(performance.now() - recStartedPerfRef.current);
    markInRef.current = ms;
    setMarkInMs(ms);
    setStatus(`Mark 1 @ ${ms} ms`);
  }

  async function onMark2() {
    if (phase !== "recording" || recorderRef.current?.state !== "recording") return;
    if (markInRef.current == null || markOutRef.current != null || stoppingRef.current) return;
    const ms = Math.round(performance.now() - recStartedPerfRef.current);
    markOutRef.current = ms;
    setMarkOutMs(ms);
    setStatus(`Mark 2 @ ${ms} ms · +1s…`);
    stoppingRef.current = true;
    setStopping(true);
    await new Promise((r) => setTimeout(r, 1000));
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
    setLandscape(isLandscape());
    setStageFullscreen(!!document.fullscreenElement);
  }

  const onAnalyseStarted = useCallback(() => {
    setAnalyseStarted(true);
    void exitFullscreenUnlockOrientation().then(() => {
      setStageFullscreen(!!document.fullscreenElement);
      setLandscape(isLandscape());
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
  const statusLine =
    phase === "recording" && !running && markInMs == null
      ? "Waiting for start…"
      : status;

  // recording → fullscreen; ended before analyse → ↻; analysing/results → download (no reset)
  const showDownload = analyseStarted;
  const showReset =
    !analyseStarted && (phase === "ended" || phase === "error");
  const showRaceEndOverlay = phase === "ended" && !analyseStarted;

  function downloadFullClip() {
    if (!clipBlob) return;
    void downloadBlob(clipBlob, `finish-${code}-full-${Date.now()}.webm`);
    pushLog("Downloaded full clip (includes +1s pad after Mark 2)");
  }

  return (
    <Screen className="h-dvh max-h-dvh max-w-none overflow-hidden">
      <div
        ref={stageRef}
        className="flex min-h-0 flex-1 flex-col bg-void [:fullscreen]:h-dvh [:fullscreen]:w-screen"
      >
        <TopBar
          backHref={`/e/${code}/help`}
          title="Finish Cam"
          extra={
            showDownload ? (
              <button
                type="button"
                className={ICON_BTN}
                aria-label="Download full clip"
                disabled={!clipBlob}
                onClick={downloadFullClip}
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
            ) : showReset ? (
              <button
                type="button"
                className={ICON_BTN}
                aria-label={phase === "error" ? "Reset" : "Record again"}
                onClick={() => void startSession()}
              >
                ↻
              </button>
            ) : (
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
            )
          }
          info="Landscape finish camera. Continuous record; Mark 1 enter / Mark 2 exit. After Mark 2 keep +1s then RACE END. Analyse runs in-app YOLO on Mark1…Mark2 and writes one finish time per lane."
        />

        <div
          className="relative mx-4 min-h-0 flex-1 overflow-hidden rounded-2xl bg-black ring-1 ring-line"
          style={{ containerType: "size" }}
        >
          {!landscape && !analyseShow && !snapshotPreview ? (
            <video
              src="/Rotate.mp4"
              playsInline
              muted
              autoPlay
              loop
              className="absolute inset-0 z-[5] h-full w-full object-contain"
              aria-label="Rotate phone to landscape"
            />
          ) : null}

          {/* object-contain both axes: min(stageW, stageH×ar) × min(stageH, stageW/ar), centered */}
          <div
            className={`absolute inset-0 flex items-center justify-center${
              landscape || snapshotPreview ? "" : " invisible"
            }`}
          >
            {snapshotPreview ? (
              <div className="relative flex h-full w-full items-center justify-center">
                {/* YOLO finish-frame: box + red line already baked into JPEG */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={snapshotPreview.snapshotDataUrl}
                  alt={`Lane ${snapshotPreview.lane} finish frame`}
                  className="max-h-full max-w-full object-contain"
                />
                <div className="pointer-events-none absolute top-3 left-3 z-[3] rounded-lg border border-line bg-black/75 px-2.5 py-1.5 text-xs font-bold tracking-wide text-sand">
                  Lane {snapshotPreview.lane}
                  {snapshotPreview.finishMs != null
                    ? ` · ${formatClock(snapshotPreview.finishMs, 2)}`
                    : ""}
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
                {landscape ? (
                  <>
                    <div
                      className="pointer-events-none absolute inset-y-0 left-1/2 z-[2] w-[3px] -translate-x-1/2 bg-stop shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
                      aria-hidden
                    />
                    <div className="pointer-events-none absolute top-3 left-[calc(50%+10px)] z-[3] rounded-lg border border-stop bg-[#7f1d1d]/90 px-2.5 py-1.5 text-xs font-bold tracking-wide text-[#fecaca]">
                      Finishing Line
                    </div>
                  </>
                ) : null}
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
          className={`flex flex-col gap-2 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] ${
            analyseHasResults ? "min-h-0 flex-1" : "shrink-0"
          }`}
        >
          <div className="flex shrink-0 items-center justify-between gap-2 text-xs font-bold uppercase tracking-wider text-dim">
            <span>{statusLine}</span>
            <span className="font-mono tabular text-sand">
              {markInMs != null ? `M1 ${markInMs}ms` : "—"}
              {" · "}
              {markOutMs != null ? `M2 ${markOutMs}ms` : "—"}
            </span>
          </div>

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
              onEvent={setEvent}
              onLog={pushLog}
              onStatus={setStatus}
              onAnalyseStarted={onAnalyseStarted}
              onHasResults={setAnalyseHasResults}
              onShowSnapshot={setSnapshotPreview}
              shownBib={snapshotPreview?.bib ?? null}
            />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <BigBtn tone="plain" className="w-full" disabled={!canMark1} onClick={onMark1}>
                Mark 1 · enter
              </BigBtn>
              <BigBtn
                tone="danger"
                className="w-full"
                disabled={!canMark2}
                onClick={() => void onMark2()}
              >
                Mark 2 · exit
              </BigBtn>
            </div>
          )}

          {camError ? <p className="text-sm font-semibold text-stop">{camError}</p> : null}
        </div>
      </div>
    </Screen>
  );
}
