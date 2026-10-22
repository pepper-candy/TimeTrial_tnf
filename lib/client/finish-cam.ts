/** Sprint Finish Cam media helpers (client-only). Does not touch TT Timer/Marker APIs. */

export type FinishCamMeta = {
  /** Server-ish wall ms when recording began (offset-corrected). */
  recServerAt: number;
  markInMs: number | null;
  markOutMs: number | null;
  /** YOLO window end = Mark2 + 1s pad. */
  analyseEndMs: number | null;
  durationMs: number;
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

/** Best-effort fullscreen + orientation.lock; phones often ignore lock without gesture. */
export async function tryLockLandscape(): Promise<void> {
  try {
    const el = document.documentElement;
    if (el.requestFullscreen) await el.requestFullscreen();
  } catch {
    /* ignore */
  }
  try {
    const orient = screen.orientation as ScreenOrientation & {
      lock?: (o: string) => Promise<void>;
    };
    if (orient?.lock) await orient.lock("landscape");
  } catch {
    /* ignore — show rotate nudge instead */
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

export type ZoomCaps = { min: number; max: number; step: number; value: number };

export function readZoomCaps(track: MediaStreamTrack | null): ZoomCaps | null {
  if (!track?.getCapabilities) return null;
  const caps = track.getCapabilities() as MediaTrackCapabilities & {
    zoom?: { min: number; max: number; step?: number };
  };
  if (!caps.zoom) return null;
  const settings = (track.getSettings?.() ?? {}) as MediaTrackSettings & { zoom?: number };
  return {
    min: caps.zoom.min,
    max: caps.zoom.max,
    step: caps.zoom.step || 0.1,
    value: settings.zoom ?? caps.zoom.min,
  };
}

export async function applyZoom(track: MediaStreamTrack | null, zoom: number): Promise<void> {
  if (!track) return;
  await track.applyConstraints({ advanced: [{ zoom } as MediaTrackConstraintSet] });
}

export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}

/** TODO(sprint): weak bang-on-soundtrack peak vs Starter server startedAt (sound travel — verify only). */
export const BANG_SOUNDTRACK_TODO =
  "TODO: weak bang-on-soundtrack vs Starter server time (sound travel)";
