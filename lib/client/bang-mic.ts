"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * One shared scale for meter fill, Sensitivity / 1s-max markers, and bang floor:
 * raw time-domain peak (0–1). Bar % = raw / DISPLAY_FULL_AT (capped at 100).
 * Crossing the Sensitivity marker ⇒ peak >= threshold; below marker must not fire.
 * Rise / noise-margin only add confirmation above that floor — never lower it.
 * From Sound_n_Camera_Test/bang.html peak idea; thresholds tuned for airhorn / board clap.
 */
/** Raw peak (0–1) that maps the level bar (and marker) to ~100%. */
export const DISPLAY_FULL_AT = 0.55;
/**
 * Absolute peak floor for bang onset (raw 0–1). Sensitivity slider = this value;
 * marker position and detector use it directly.
 */
export const DEFAULT_BANG_THRESHOLD = 0.22;
/** Sensible slider range for Sensitivity (raw peak). */
export const BANG_THRESHOLD_MIN = 0.08;
export const BANG_THRESHOLD_MAX = 0.45;
/** Must also clear ambient by this margin (never replaces the Sensitivity floor). */
const TRIGGER_OVER_NOISE = 0.14;
/** Frame-to-frame jump that marks onset (rejects slow talk / wind). */
const TRIGGER_RISE = 0.1;
/** Loud absolute peak (vs Sensitivity) can count as onset without a rise sample. */
const TRIGGER_STRONG_RATIO = 0.38 / DEFAULT_BANG_THRESHOLD;
const NOISE_EMA = 0.06;
const NOISE_FLOOR_MIN = 0.02;
/** Ignore mic noise from the Arm tap / phone handling. */
const ARM_GRACE_MS = 200;
const BANG_COOLDOWN_MS = 400;
/** Auto Sensitivity: sample live peaks (no Arm) then set floor above ambient. */
const AUTO_SAMPLE_MS = 5000;
/** Margin above max ambient peak so current noise stays under the marker. */
const AUTO_MARGIN = 0.08;
/** Rolling window for UI “max noise last 1s” marker (same raw-peak scale). */
const ROLLING_MAX_MS = 1000;

/** Map raw peak or threshold onto the shared bar (0–100). */
export function bangBarPct(raw: number): number {
  return Math.min(100, (raw / DISPLAY_FULL_AT) * 100);
}

/** @deprecated Prefer DISPLAY_FULL_AT / bangBarPct. */
export const BANG_PEAK = DISPLAY_FULL_AT;

export type BangMicStatus = "idle" | "opening" | "ready" | "armed" | "denied" | "error";

function clampThreshold(v: number) {
  return Math.min(BANG_THRESHOLD_MAX, Math.max(BANG_THRESHOLD_MIN, v));
}

/**
 * Sprint Starter only: warm the mic early, expose level, Arm → bang onset callback.
 * Does not touch camera or Time Trial Timer start.
 */
export function useBangMic(onBang: () => void) {
  const [status, setStatus] = useState<BangMicStatus>("idle");
  const [level, setLevel] = useState(0);
  /** Max raw peak in the last ~1s (UI marker only; does not affect bang detect). */
  const [levelMax1s, setLevelMax1s] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [threshold, setThresholdState] = useState(DEFAULT_BANG_THRESHOLD);
  const [calibrating, setCalibrating] = useState(false);

  const onBangRef = useRef(onBang);
  const armedRef = useRef(false);
  const armedAtRef = useRef(0);
  const openingRef = useRef(false);
  const lastBangRef = useRef(0);
  const prevPeakRef = useRef(0);
  const noiseFloorRef = useRef(NOISE_FLOOR_MIN);
  const thresholdRef = useRef(DEFAULT_BANG_THRESHOLD);
  const calibratingRef = useRef(false);
  const calibMaxRef = useRef(0);
  /** Timestamped peaks for rolling 1s max (pruned each tick). */
  const peakHistRef = useRef<{ t: number; v: number }[]>([]);
  const rafRef = useRef(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    onBangRef.current = onBang;
  }, [onBang]);

  const setThreshold = useCallback((next: number) => {
    const v = clampThreshold(next);
    thresholdRef.current = v;
    setThresholdState(v);
  }, []);

  const stopLoop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  }, []);

  const tick = useCallback(() => {
    const analyser = analyserRef.current;
    const data = dataRef.current;
    if (!analyser || !data) return;
    // Cast: DOM typings want ArrayBuffer-backed Uint8Array; Analyser accepts this buffer.
    analyser.getByteTimeDomainData(data as Uint8Array<ArrayBuffer>);
    let peak = 0;
    for (let i = 0; i < data.length; i++) {
      const v = Math.abs(data[i]! - 128) / 128;
      if (v > peak) peak = v;
    }

    // Raw peak 0–1 — same units as threshold / markers (UI maps via bangBarPct).
    setLevel(peak);

    const now = performance.now();
    const hist = peakHistRef.current;
    hist.push({ t: now, v: peak });
    while (hist.length > 0 && now - hist[0]!.t > ROLLING_MAX_MS) hist.shift();
    let max1s = 0;
    for (let i = 0; i < hist.length; i++) {
      const v = hist[i]!.v;
      if (v > max1s) max1s = v;
    }
    setLevelMax1s(max1s);

    if (calibratingRef.current && peak > calibMaxRef.current) {
      calibMaxRef.current = peak;
    }

    const prev = prevPeakRef.current;
    prevPeakRef.current = peak;
    const rise = peak - prev;

    const triggerAbs = thresholdRef.current;

    // Track ambient only when under the Sensitivity floor (keeps floor honest while armed).
    if (peak < triggerAbs) {
      const n = noiseFloorRef.current;
      noiseFloorRef.current = n + NOISE_EMA * (peak - n);
      if (noiseFloorRef.current < NOISE_FLOOR_MIN) noiseFloorRef.current = NOISE_FLOOR_MIN;
    }

    const pastGrace = now - armedAtRef.current >= ARM_GRACE_MS;
    // Hard floor = Sensitivity marker. Rise / noise / strong-onset only gate above it.
    const clearsMarker = peak >= triggerAbs;
    const aboveNoise = peak >= noiseFloorRef.current + TRIGGER_OVER_NOISE;
    const sharpOnset =
      rise >= TRIGGER_RISE || peak >= triggerAbs * TRIGGER_STRONG_RATIO;
    const onset = clearsMarker && aboveNoise && sharpOnset;

    if (
      armedRef.current &&
      pastGrace &&
      onset &&
      now - lastBangRef.current > BANG_COOLDOWN_MS
    ) {
      lastBangRef.current = now;
      armedRef.current = false;
      setStatus("ready");
      onBangRef.current();
    }
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const openMic = useCallback(async () => {
    if (analyserRef.current || openingRef.current) return;
    openingRef.current = true;
    setStatus("opening");
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      });
      streamRef.current = stream;
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      // Smaller window → fresher transient peak for onset (still time-domain only).
      analyser.fftSize = 1024;
      src.connect(analyser);
      analyserRef.current = analyser;
      dataRef.current = new Uint8Array(analyser.fftSize);
      noiseFloorRef.current = NOISE_FLOOR_MIN;
      prevPeakRef.current = 0;
      peakHistRef.current = [];
      setLevelMax1s(0);
      setStatus("ready");
      stopLoop();
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setStatus(
        msg.toLowerCase().includes("denied") || msg.toLowerCase().includes("permission")
          ? "denied"
          : "error",
      );
    } finally {
      openingRef.current = false;
    }
  }, [stopLoop, tick]);

  const arm = useCallback(() => {
    if (!analyserRef.current || armedRef.current) return false;
    armedRef.current = true;
    armedAtRef.current = performance.now();
    setStatus("armed");
    return true;
  }, []);

  const disarm = useCallback(() => {
    armedRef.current = false;
    if (analyserRef.current) setStatus("ready");
  }, []);

  /** Sample ambient peaks ~5s (mic warm, no Arm) → threshold = maxPeak + margin. */
  const autoCalibrate = useCallback(async () => {
    if (!analyserRef.current || calibratingRef.current) return false;
    calibratingRef.current = true;
    calibMaxRef.current = 0;
    setCalibrating(true);
    await new Promise<void>((r) => setTimeout(r, AUTO_SAMPLE_MS));
    const floor = Math.max(calibMaxRef.current, NOISE_FLOOR_MIN);
    setThreshold(floor + AUTO_MARGIN);
    calibratingRef.current = false;
    setCalibrating(false);
    return true;
  }, [setThreshold]);

  useEffect(() => {
    return () => {
      stopLoop();
      armedRef.current = false;
      openingRef.current = false;
      calibratingRef.current = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      void ctxRef.current?.close();
      ctxRef.current = null;
      analyserRef.current = null;
      dataRef.current = null;
    };
  }, [stopLoop]);

  return {
    status,
    level,
    levelMax1s,
    threshold,
    setThreshold,
    calibrating,
    autoCalibrate,
    error,
    openMic,
    arm,
    disarm,
  };
}
