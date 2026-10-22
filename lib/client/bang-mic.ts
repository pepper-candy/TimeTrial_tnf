"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Peak level (0–1) that counts as a bang / airhorn / board clap. From Sound_n_Camera_Test/bang.html. */
export const BANG_PEAK = 0.55;
const BANG_COOLDOWN_MS = 400;

export type BangMicStatus = "idle" | "opening" | "ready" | "armed" | "denied" | "error";

/**
 * Sprint Starter only: warm the mic early, expose level, Arm → bang peak callback.
 * Does not touch camera or Time Trial Timer start.
 */
export function useBangMic(onBang: () => void) {
  const [status, setStatus] = useState<BangMicStatus>("idle");
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const onBangRef = useRef(onBang);
  const armedRef = useRef(false);
  const openingRef = useRef(false);
  const lastBangRef = useRef(0);
  const rafRef = useRef(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    onBangRef.current = onBang;
  }, [onBang]);

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
    setLevel(peak);
    if (armedRef.current && peak > BANG_PEAK && performance.now() - lastBangRef.current > BANG_COOLDOWN_MS) {
      lastBangRef.current = performance.now();
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
      analyser.fftSize = 2048;
      src.connect(analyser);
      analyserRef.current = analyser;
      dataRef.current = new Uint8Array(analyser.fftSize);
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
    setStatus("armed");
    return true;
  }, []);

  const disarm = useCallback(() => {
    armedRef.current = false;
    if (analyserRef.current) setStatus("ready");
  }, []);

  useEffect(() => {
    return () => {
      stopLoop();
      armedRef.current = false;
      openingRef.current = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      void ctxRef.current?.close();
      ctxRef.current = null;
      analyserRef.current = null;
      dataRef.current = null;
    };
  }, [stopLoop]);

  return { status, level, error, openMic, arm, disarm };
}
