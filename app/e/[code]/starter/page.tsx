"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { RaceClock } from "@/components/clock";
import { PinGate } from "@/components/pin-gate";
import { BOTTOM_TRAY, BigBtn, ICON_BTN, Screen, TopBar } from "@/components/shell";
import { EmptyState, LoadingState } from "@/components/states";
import {
  BANG_THRESHOLD_MAX,
  BANG_THRESHOLD_MIN,
  bangBarPct,
  useBangMic,
} from "@/lib/client/bang-mic";
import { json, useEvent } from "@/lib/client/hooks";
import { hapticHoldOk } from "@/lib/haptic";
import type { EventState } from "@/lib/types";

/**
 * Sprint-only start-line helper. Time Trial keeps `/timer` START unchanged.
 * Mic warm → Arm → bang/airhorn onset → stamp `startedAt` on the phone in
 * server-ms (`Date.now() + offset`) → optimistic running UI → POST /start,
 * which clamps and persists that stamp.
 */
export default function StarterPage() {
  const { code } = useParams<{ code: string }>();
  return (
    <PinGate code={code}>
      <StarterInner code={code} />
    </PinGate>
  );
}

function StarterInner({ code }: { code: string }) {
  const { event, setEvent, offset, serverNow, error } = useEvent(code, 1500);
  const [starting, setStarting] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [startErr, setStartErr] = useState<string | null>(null);
  const startingRef = useRef(false);
  /** Latest committed event — rollback target if the optimistic start fails. */
  const eventRef = useRef<EventState | null>(event);
  /** Latest server-ms offset, so the bang stamp never reads a stale render. */
  const offsetRef = useRef(offset);

  useEffect(() => {
    eventRef.current = event;
  }, [event]);
  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  const running = event?.status === "running" && event.startedAt != null;
  const adminReady = Boolean(event?.ready);
  const isSprint = event?.kind === "sprint";

  const fireStart = useCallback(async () => {
    if (startingRef.current || !adminReady) return;
    startingRef.current = true;
    setStarting(true);
    setStartErr(null);

    // Stamp the bang here — before any await — in server-ms domain. The POST can
    // crawl on 4G; the race clock must not. `offset` absorbs phone clock skew.
    const bangAt = Math.round(Date.now() + offsetRef.current);
    const prior = eventRef.current;
    // Optimistic: race is running on the bang, not on the POST round trip.
    if (prior) setEvent({ ...prior, status: "running", startedAt: bangAt });
    hapticHoldOk();

    try {
      const data = await json<{ event: EventState }>(`/api/events/${code}/start`, {
        method: "POST",
        body: JSON.stringify({ startedAt: bangAt }),
      });
      setEvent(data.event);
    } catch {
      if (prior) setEvent(prior);
      setStartErr("Start failed — try Arm again");
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }, [adminReady, code, setEvent]);

  const undoStart = useCallback(async () => {
    if (undoing || !running) return;
    setUndoing(true);
    setStartErr(null);
    try {
      const data = await json<{ event: EventState }>(`/api/events/${code}/start`, {
        method: "DELETE",
      });
      setEvent(data.event);
    } catch {
      setStartErr("Undo start failed");
    } finally {
      setUndoing(false);
    }
  }, [code, running, setEvent, undoing]);

  const onBang = useCallback(() => {
    if (running || !adminReady) return;
    void fireStart();
  }, [running, adminReady, fireStart]);

  const {
    status: mic,
    level,
    levelMax1s,
    threshold,
    setThreshold,
    calibrating,
    autoCalibrate,
    error: micErr,
    openMic,
    arm,
    disarm,
  } = useBangMic(onBang);
  const fillPct = bangBarPct(level);
  const markerPct = bangBarPct(threshold);
  const max1sPct = bangBarPct(levelMax1s);
  const levelTrail = useMicLevelTrail(fillPct);

  // Warm mic as soon as we know this is a sprint event (not on TT).
  useEffect(() => {
    if (!isSprint || running) return;
    void openMic();
  }, [isSprint, running, openMic]);

  useEffect(() => {
    if (running) disarm();
  }, [running, disarm]);

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
      <Screen>
        <TopBar backHref={`/e/${code}`} title="Starter" />
        <LoadingState rows={4} />
      </Screen>
    );
  }

  // Missing kind hydrates as time-trial — keep TT on Timer, not here.
  if (event.kind !== "sprint") {
    return (
      <Screen>
        <TopBar backHref={`/e/${code}`} title="Starter" />
        <EmptyState
          title="Sprint only"
          hint="Starter is for sprint events. Use Timer for time trials."
        />
        <div className="px-4 pb-8">
          <BigBtn href={`/e/${code}/timer`} className="w-full">
            Open Timer
          </BigBtn>
        </div>
      </Screen>
    );
  }

  return (
    <Screen className="h-dvh max-h-dvh max-w-none overflow-hidden">
      <TopBar
        className="!mb-0"
        backHref={`/e/${code}`}
        title={
          <div className="flex flex-col items-center leading-none">
            <RaceClock
              startedAt={event.startedAt ?? null}
              now={serverNow}
              className="text-3xl sm:text-4xl"
            />
            <p className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.16em] text-dim">
              Starter
              {starting ? " · starting…" : undoing ? " · reset…" : null}
            </p>
          </div>
        }
        extra={
          running || mic === "armed" ? (
            <button
              type="button"
              className={ICON_BTN}
              aria-label={running ? "Undo start" : "Disarm"}
              disabled={undoing}
              onClick={() => {
                if (running) void undoStart();
                else disarm();
              }}
            >
              ↻
            </button>
          ) : null
        }
        info="Arm when set… bang starts the race clock. Mic warms early; clap, airhorn, or gun onset tells the server to start. Level must clear the Sensitivity line. Race clock stays server time."
      />

      <div className="flex min-h-0 flex-1 flex-col justify-center gap-6 px-4 pb-4">
        <p className="text-center text-base font-bold text-dim">
          Arm when set… bang starts the race clock.
        </p>
        <div className="mx-auto w-full max-w-md">
          <div className="flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wider text-dim">
            <span>Sensitivity</span>
            <button
              type="button"
              className="tap rounded-md px-1.5 py-0.5 text-accent ring-1 ring-line disabled:opacity-40"
              disabled={
                calibrating ||
                mic === "idle" ||
                mic === "opening" ||
                mic === "denied" ||
                mic === "error"
              }
              onClick={() => void autoCalibrate()}
            >
              Auto
            </button>
          </div>
          <label className="mt-1 block">
            <span className="sr-only">Sensitivity</span>
            <input
              type="range"
              className="w-full accent-accent"
              min={BANG_THRESHOLD_MIN}
              max={BANG_THRESHOLD_MAX}
              step={0.01}
              value={threshold}
              disabled={calibrating}
              onChange={(e) => setThreshold(Number(e.target.value))}
            />
          </label>
          {/* One meter: live level + peak trail + 1s-max + Sensitivity. */}
          <div className="relative mt-4 h-3 overflow-hidden rounded-full bg-panel2 ring-1 ring-line">
            {/* Peak-hold ghost: stamps at high water, fades opacity over 1s after drop. */}
            {levelTrail.opacity > 0 ? (
              <div
                className={`pointer-events-none absolute inset-y-0 left-0 rounded-full ${
                  mic === "armed" ? "bg-bell" : "bg-go"
                }`}
                style={{
                  width: `${levelTrail.pct}%`,
                  opacity: levelTrail.opacity,
                }}
                aria-hidden
              />
            ) : null}
            {/* No width transition: fill must match raw peak instantly so it
                can touch the 1s-max marker when current sample == window max. */}
            <div
              className={`relative h-full rounded-full ${
                mic === "armed" ? "bg-bell" : "bg-go"
              }`}
              style={{ width: `${fillPct}%` }}
            />
            {/* Rolling 1s max noise — sand, dimmer than Sensitivity accent. */}
            <div
              className="pointer-events-none absolute inset-y-0 w-0.5 bg-sand/55"
              style={{ left: `calc(${max1sPct}% - 1px)` }}
              aria-hidden
            />
            <div
              className="pointer-events-none absolute inset-y-0 w-0.5 bg-accent shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
              style={{ left: `calc(${markerPct}% - 1px)` }}
              aria-hidden
            />
          </div>
          <p className="mt-2 text-center text-xs font-bold uppercase tracking-wider text-dim">
            {calibrating ? "Listening…" : micLabel(mic, micErr)}
          </p>
        </div>

        {startErr ? (
          <p className="text-center text-sm font-black text-stop">{startErr}</p>
        ) : null}
        {micErr && (mic === "denied" || mic === "error") ? (
          <p className="text-center text-sm font-bold text-stop">{micErr}</p>
        ) : null}
      </div>

      <div className={BOTTOM_TRAY}>
        <div className="pointer-events-auto">
          {running ? (
            <div className="tap flex h-[42dvh] w-full flex-col items-center justify-center gap-2 rounded-[2rem] bg-panel2 text-dim">
              <span className="text-5xl font-black text-go">STARTED</span>
              <span className="text-base font-bold">Race clock is live</span>
            </div>
          ) : !adminReady ? (
            <button
              type="button"
              disabled
              className="tap flex h-[42dvh] w-full flex-col items-center justify-center gap-2 rounded-[2rem] bg-panel2 text-dim"
            >
              <span className="text-5xl font-black">WAITING</span>
              <span className="text-base font-bold">Waiting Event to be Ready</span>
            </button>
          ) : mic === "denied" || mic === "error" ? (
            <button
              type="button"
              className="tap flex h-[42dvh] w-full flex-col items-center justify-center gap-2 rounded-[2rem] bg-accent text-ink"
              onClick={() => void openMic()}
            >
              <span className="text-4xl font-black">OPEN MIC</span>
              <span className="text-base font-bold">Allow microphone then Arm</span>
            </button>
          ) : mic === "idle" || mic === "opening" ? (
            <button
              type="button"
              disabled
              className="tap flex h-[42dvh] w-full flex-col items-center justify-center gap-2 rounded-[2rem] bg-panel2 text-dim"
            >
              <span className="text-5xl font-black">MIC…</span>
              <span className="text-base font-bold">Warming microphone</span>
            </button>
          ) : mic === "armed" || starting ? (
            <button
              type="button"
              disabled
              className="tap flex h-[42dvh] w-full flex-col items-center justify-center gap-2 rounded-[2rem] bg-bell text-ink"
            >
              <span className="text-5xl font-black">{starting ? "…" : "ARMED"}</span>
              <span className="text-base font-bold">
                {starting ? "Starting race…" : "Wait for bang / clap / horn"}
              </span>
            </button>
          ) : (
            <button
              type="button"
              className="tap flex h-[42dvh] w-full items-center justify-center rounded-[2rem] bg-go text-5xl font-black text-ink"
              onPointerDown={(e) => {
                e.preventDefault();
                arm();
              }}
            >
              ARM
            </button>
          )}
        </div>
      </div>
    </Screen>
  );
}

/** Peak-hold ghost for the level bar: rises with live fill, fades opacity over 1s after drop. */
const LEVEL_TRAIL_MS = 1000;

function useMicLevelTrail(fillPct: number) {
  const [trail, setTrail] = useState({ pct: 0, opacity: 0 });
  const peakRef = useRef(0);
  const bornRef = useRef(0);
  const liveRef = useRef(fillPct);
  liveRef.current = fillPct;

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      const live = liveRef.current;
      if (live >= peakRef.current) {
        peakRef.current = live;
        bornRef.current = now;
      }
      let pct = peakRef.current;
      let opacity = 0;
      if (pct > live + 0.05) {
        opacity = Math.max(0, 1 - (now - bornRef.current) / LEVEL_TRAIL_MS);
        if (opacity <= 0) {
          peakRef.current = live;
          pct = live;
          opacity = 0;
        }
      } else {
        peakRef.current = live;
        bornRef.current = now;
        pct = live;
      }
      setTrail((prev) =>
        prev.pct === pct && prev.opacity === opacity ? prev : { pct, opacity }
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return trail;
}

function micLabel(
  mic: ReturnType<typeof useBangMic>["status"],
  err: string | null,
): string {
  if (mic === "armed") return "Armed — listening for bang";
  if (mic === "ready") return "Mic ready — not armed";
  if (mic === "opening") return "Opening mic…";
  if (mic === "denied") return "Mic permission denied";
  if (mic === "error") return err ? "Mic error" : "Mic error";
  return "Mic closed";
}
