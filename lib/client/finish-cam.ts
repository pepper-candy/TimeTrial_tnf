/** Sprint Finish Cam media helpers (client-only). Does not touch TT Timer/Marker APIs. */

export type FinishCamMeta = {
  /** Server-ish wall ms when recording began (offset-corrected). */
  recServerAt: number;
  markInMs: number | null;
  markOutMs: number | null;
  /** Clip end (download/full blob). Two-press = markOut (no pad); single-press = last press + buffer. */
  analyseEndMs: number | null;
  durationMs: number;
  /** Single-press mode: video offsets (ms) of each passer press, in lane order. */
  pressesMs: number[] | null;
  note: string;
};

export function pickRecorderMime(): string {
  const types = [
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9,opus",
    "video/webm",
    "video/mp4",
  ];
  for (const t of types) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(t)) return t;
  }
  return "";
}

export function isLandscape(): boolean {
  if (typeof window === "undefined") return true;
  return (
    window.matchMedia("(orientation: landscape)").matches ||
    window.innerWidth > window.innerHeight
  );
}

/** Best-effort exit fullscreen + unlock orientation (e.g. Analyse → return to portrait). */
export async function exitFullscreenUnlockOrientation(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
  } catch {
    /* ignore */
  }
  try {
    screen.orientation?.unlock?.();
  } catch {
    /* ignore */
  }
}

/**
 * Toggle stage fullscreen (Finish Cam: TopBar + preview + Mark controls; log outside).
 */
export async function toggleStageFullscreen(stage?: HTMLElement | null): Promise<void> {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    const target = stage ?? document.documentElement;
    if (target.requestFullscreen) await target.requestFullscreen();
  } catch {
    /* ignore */
  }
}

export async function openFinishStream(deviceId?: string): Promise<{
  stream: MediaStream;
  track: MediaStreamTrack;
}> {
  const constraints: MediaStreamConstraints = {
    video: deviceId
      ? {
          deviceId: { exact: deviceId },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          facingMode: { ideal: "environment" },
        }
      : {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
    audio: true,
  };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  const track = stream.getVideoTracks()[0];
  return { stream, track };
}

export type ZoomCaps = {
  min: number;
  max: number;
  step: number;
  value: number;
  /** Hardware zoom via applyConstraints; otherwise digital crop into the recorded stream. */
  mode: "hardware" | "digital";
};

const DIGITAL_ZOOM: ZoomCaps = { min: 1, max: 3, step: 0.1, value: 1, mode: "digital" };

export function readZoomCaps(track: MediaStreamTrack | null): ZoomCaps {
  if (track?.getCapabilities) {
    const caps = track.getCapabilities() as MediaTrackCapabilities & {
      zoom?: { min: number; max: number; step?: number };
    };
    if (caps.zoom && caps.zoom.max > caps.zoom.min) {
      const settings = (track.getSettings?.() ?? {}) as MediaTrackSettings & { zoom?: number };
      return {
        min: caps.zoom.min,
        max: caps.zoom.max,
        step: caps.zoom.step || 0.1,
        value: settings.zoom ?? caps.zoom.min,
        mode: "hardware",
      };
    }
  }
  return { ...DIGITAL_ZOOM };
}

export async function applyHardwareZoom(
  track: MediaStreamTrack | null,
  zoom: number,
): Promise<void> {
  if (!track) return;
  await track.applyConstraints({ advanced: [{ zoom } as MediaTrackConstraintSet] });
}

/**
 * Draws the live video into a canvas with centre-crop digital zoom and returns a
 * stream suitable for MediaRecorder (so zoom is in the recording, not preview-only).
 */
export function startZoomPipeline(
  video: HTMLVideoElement,
  camera: MediaStream,
  zoomRef: { current: number },
): { canvas: HTMLCanvasElement; recordStream: MediaStream; stop: () => void } {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas unavailable");

  const vw = video.videoWidth || 1280;
  const vh = video.videoHeight || 720;
  canvas.width = vw;
  canvas.height = vh;

  let raf = 0;
  let alive = true;

  function draw() {
    if (!alive) return;
    const z = Math.max(1, zoomRef.current || 1);
    const sw = vw / z;
    const sh = vh / z;
    const sx = (vw - sw) / 2;
    const sy = (vh - sh) / 2;
    ctx!.drawImage(video, sx, sy, sw, sh, 0, 0, vw, vh);
    raf = requestAnimationFrame(draw);
  }

  // Wait until dimensions exist, then start.
  function kick() {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (w && h) {
      canvas.width = w;
      canvas.height = h;
      draw();
      return;
    }
    raf = requestAnimationFrame(kick);
  }
  kick();

  const fps = 30;
  const canvasStream = canvas.captureStream(fps);
  // Keep mic/audio from the camera stream on the recorded mix.
  for (const t of camera.getAudioTracks()) {
    canvasStream.addTrack(t);
  }

  return {
    canvas,
    recordStream: canvasStream,
    stop: () => {
      alive = false;
      cancelAnimationFrame(raf);
      canvasStream.getVideoTracks().forEach((t) => t.stop());
    },
  };
}

export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}

/** TODO(sprint): weak bang-on-soundtrack peak vs Starter server startedAt (sound travel — verify only). */
export const BANG_SOUNDTRACK_TODO =
  "TODO: weak bang-on-soundtrack vs Starter server time (sound travel)";

/** YOLO / Analyse uses Mark1…Mark2 (or single-press ±0.5s buffer) — no extra pad. */
export const YOLO_SLICE_NOTE =
  "YOLO window = Mark1…Mark2 (or single-press ±0.5s buffer); no post-Mark2 pad";
