"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { PinGate } from "@/components/pin-gate";
import { BigBtn, Screen, TopBar } from "@/components/shell";
import { EmptyState, LoadingState } from "@/components/states";
import {
  applyZoom,
  BANG_SOUNDTRACK_TODO,
  isLandscape,
  openFinishStream,
  pickRecorderMime,
  readZoomCaps,
  stopStream,
  tryLockLandscape,
  type FinishCamMeta,
  type ZoomCaps,
} from "@/lib/client/finish-cam";
import { useEvent } from "@/lib/client/hooks";

/**
 * Sprint-only Finish Cam helper.
 * Does not call mark/tap APIs — recording marks are local video offsets for a future YOLO window.
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
  const { event, error, serverNow } = useEvent(code, 4000);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recStartedPerfRef = useRef(0);
  const recServerAtRef = useRef(0);
  const markInRef = useRef<number | null>(null);
  const markOutRef = useRef<number | null>(null);
  const stoppingRef = useRef(false);
  const blobRef = useRef<Blob | null>(null);
  const metaRef = useRef<FinishCamMeta | null>(null);
  const serverNowRef = useRef(serverNow);
  serverNowRef.current = serverNow;

  const [phase, setPhase] = useState<Phase>("boot");
  const [status, setStatus] = useState("Warming camera…");
  const [landscape, setLandscape] = useState(true);
  const [zoom, setZoom] = useState<ZoomCaps | null>(null);
  const [markInMs, setMarkInMs] = useState<number | null>(null);
  const [markOutMs, setMarkOutMs] = useState<number | null>(null);
  const [analyseShow, setAnalyseShow] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [log, setLog] = useState(
    "Aim the finish on the red line. Zoom is on the live (recorded) stream.\nMark 1 enter · Mark 2 exit · +1s then RACE END.",
  );
  const [camError, setCamError] = useState<string | null>(null);
  const sessionKickRef = useRef(false);

  const pushLog = useCallback((msg: string) => {
    setLog((prev) => `${msg}\n${prev}`);
  }, []);

  useEffect(() => {
    function check() {
      setLandscape(isLandscape());
    }
    check();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
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
    setMarkInMs(null);
    setMarkOutMs(null);
    setStopping(false);
    markInRef.current = null;
    markOutRef.current = null;
    stoppingRef.current = false;
    blobRef.current = null;
    metaRef.current = null;
    chunksRef.current = [];

    try {
      await tryLockLandscape();
      setLandscape(isLandscape());

      teardown();
      const { stream, track } = await openFinishStream();
      streamRef.current = stream;
      trackRef.current = track;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }

      const caps = readZoomCaps(track);
      setZoom(caps);

      const mime = pickRecorderMime();
      const opts: MediaRecorderOptions = mime
        ? { mimeType: mime, videoBitsPerSecond: 6_000_000 }
        : { videoBitsPerSecond: 6_000_000 };
      const recorder = new MediaRecorder(stream, opts);
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
          note: `${BANG_SOUNDTRACK_TODO}. YOLO window = [Mark1 … Mark2+1s] only.`,
        };
        metaRef.current = meta;
        setPhase("ended");
        setStatus("Stopped · RACE END");
        setAnalyseShow(true);
        pushLog(
          `recording stopped · bytes=${blob.size} · marks in=${markIn} out=${markOut} (+1s pad)`,
        );
      };

      recStartedPerfRef.current = performance.now();
      // Offset-corrected wall time (same pattern as race clock helpers).
      recServerAtRef.current = serverNowRef.current || Date.now();
      recorder.start(250);
      setPhase("recording");
      setStatus("Recording…");
      pushLog(
        `record start · serverAt≈${Math.round(recServerAtRef.current)} · ${track.label || "camera"}`,
      );
    } catch (e) {
      setPhase("error");
      const msg = e instanceof Error ? e.message : String(e);
      setCamError(msg);
      setStatus("Camera error");
      pushLog(msg);
    }
  }, [pushLog, teardown]);

  // Auto-start once for sprint (continuous record while open).
  useEffect(() => {
    if (!event || event.kind !== "sprint") return;
    if (sessionKickRef.current) return;
    sessionKickRef.current = true;
    void startSession();
  }, [event, startSession]);

  function onMark1() {
    if (phase !== "recording" || recorderRef.current?.state !== "recording") return;
    if (markInRef.current != null) return;
    const ms = Math.round(performance.now() - recStartedPerfRef.current);
    markInRef.current = ms;
    setMarkInMs(ms);
    const serverMark = recServerAtRef.current + ms;
    setStatus(`Mark 1 @ ${ms} ms`);
    pushLog(`Mark 1 enter @ video+${ms}ms · server≈${Math.round(serverMark)}`);
  }

  async function onMark2() {
    if (phase !== "recording" || recorderRef.current?.state !== "recording") return;
    if (markInRef.current == null || markOutRef.current != null || stoppingRef.current) return;
    const ms = Math.round(performance.now() - recStartedPerfRef.current);
    markOutRef.current = ms;
    setMarkOutMs(ms);
    setStatus(`Mark 2 @ ${ms} ms · +1s…`);
    pushLog(`Mark 2 exit @ video+${ms}ms · keep 1s then stop`);
    stoppingRef.current = true;
    setStopping(true);
    await new Promise((r) => setTimeout(r, 1000));
    try {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    } catch {
      /* ignore */
    }
    stopStream(streamRef.current);
    streamRef.current = null;
    trackRef.current = null;
  }

  function onAnalyse() {
    const meta = metaRef.current;
    const from = meta?.markInMs ?? markInMs;
    const to = meta?.analyseEndMs ?? (markOutMs != null ? markOutMs + 1000 : null);
    pushLog(
      `Analyse (stub)\n  YOLO window only: video [${from} … ${to}] ms\n  recServerAt=${meta?.recServerAt}\n  ${BANG_SOUNDTRACK_TODO}\n  blob bytes=${blobRef.current?.size ?? 0}`,
    );
    setStatus("Analyse stub done");
    if (blobRef.current) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blobRef.current);
      a.download = `finish-${code}-${Date.now()}.webm`;
      a.click();
      URL.revokeObjectURL(a.href);
    }
  }

  async function onZoom(v: number) {
    if (!zoom) return;
    setZoom({ ...zoom, value: v });
    try {
      await applyZoom(trackRef.current, v);
    } catch (e) {
      pushLog(`zoom error: ${e instanceof Error ? e.message : e}`);
    }
  }

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

  // Sprint-only gate — TT events keep using Marker; do not repurpose this page.
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

  const canMark1 = phase === "recording" && markInMs == null;
  const canMark2 =
    phase === "recording" && markInMs != null && markOutMs == null && !stopping;

  return (
    <Screen className="max-w-none">
      <TopBar
        backHref={`/e/${code}/help`}
        title="Finish Cam"
        info="Landscape finish camera. Continuous record; Mark 1 enter / Mark 2 exit. After Mark 2 keep +1s then RACE END. Analyse exports the marked slice window for later YOLO — no auto timing here."
      />

      {!landscape ? (
        <div className="mx-4 mb-3 rounded-2xl bg-stop/20 px-4 py-3 text-center text-sm font-bold text-stop ring-1 ring-stop/60">
          Rotate phone to landscape — finish cam needs a wide view
        </div>
      ) : null}

      <div className="relative mx-4 min-h-[42dvh] flex-1 overflow-hidden rounded-2xl bg-black ring-1 ring-line">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="h-full w-full object-cover"
        />
        <div
          className="pointer-events-none absolute inset-y-0 left-1/2 z-[2] w-[3px] -translate-x-1/2 bg-stop shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
          aria-hidden
        />
        <div className="pointer-events-none absolute top-3 right-3 z-[3] rounded-lg border border-stop bg-[#7f1d1d]/90 px-2.5 py-1.5 text-xs font-bold tracking-wide text-[#fecaca]">
          Finishing Line
        </div>
        {phase === "ended" ? (
          <div className="absolute inset-0 z-[4] flex items-center justify-center bg-black/55 text-3xl font-black tracking-[0.08em] sm:text-4xl">
            RACE END
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between gap-2 text-xs font-bold uppercase tracking-wider text-dim">
          <span>{status}</span>
          <span className="font-mono tabular text-sand">
            {markInMs != null ? `M1 ${markInMs}ms` : "—"}
            {" · "}
            {markOutMs != null ? `M2 ${markOutMs}ms` : "—"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <BigBtn
            tone="plain"
            className="w-full"
            disabled={!canMark1}
            onClick={onMark1}
          >
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

        <BigBtn
          tone="go"
          className={`w-full transition-opacity duration-500 ${
            analyseShow ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          disabled={!analyseShow}
          onClick={onAnalyse}
        >
          Analyse
        </BigBtn>

        {zoom ? (
          <label className="block text-xs font-bold uppercase tracking-wider text-dim">
            Zoom {zoom.value.toFixed(1)}
            <input
              type="range"
              className="mt-1 w-full accent-accent"
              min={zoom.min}
              max={zoom.max}
              step={zoom.step}
              value={zoom.value}
              disabled={phase !== "recording"}
              onChange={(e) => void onZoom(Number(e.target.value))}
            />
          </label>
        ) : null}

        {phase === "ended" || phase === "error" ? (
          <BigBtn tone="plain" className="w-full" onClick={() => void startSession()}>
            {phase === "error" ? "Retry camera" : "Record again"}
          </BigBtn>
        ) : null}

        {camError ? <p className="text-sm font-semibold text-stop">{camError}</p> : null}

        <pre className="max-h-28 overflow-auto rounded-xl bg-void p-3 font-mono text-[11px] leading-snug whitespace-pre-wrap text-dim">
          {log}
        </pre>
      </div>
    </Screen>
  );
}
