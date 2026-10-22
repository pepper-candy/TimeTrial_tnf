"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { RaceClock } from "@/components/clock";
import { PinGate } from "@/components/pin-gate";
import { BOTTOM_TRAY, BigBtn, Screen, TopBar } from "@/components/shell";
import { EmptyState, LoadingState } from "@/components/states";
import { useBangMic } from "@/lib/client/bang-mic";
import { json, useEvent } from "@/lib/client/hooks";
import { hapticHoldOk } from "@/lib/haptic";
import type { EventState } from "@/lib/types";

/**
 * Sprint-only start-line helper. Time Trial keeps `/timer` START unchanged.
 * Mic warm → Arm → bang/airhorn peak → existing POST /start (server `startedAt`).
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
  const { event, setEvent, serverNow, error } = useEvent(code, 1500);
  const [starting, setStarting] = useState(false);
  const [startErr, setStartErr] = useState<string | null>(null);
  const startingRef = useRef(false);

  const running = event?.status === "running" && event.startedAt != null;
  const adminReady = Boolean(event?.ready);
  const isSprint = event?.kind === "sprint";

  const fireStart = useCallback(async () => {
    if (startingRef.current || !adminReady) return;
    startingRef.current = true;
    setStarting(true);
    setStartErr(null);
    try {
      // Same server-authoritative start as Timer; phone only signals "now".
      const data = await json<{ event: EventState }>(`/api/events/${code}/start`, {
        method: "POST",
      });
      setEvent(data.event);
      hapticHoldOk();
    } catch {
      setStartErr("Start failed — try Arm again");
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }, [adminReady, code, setEvent]);

  const onBang = useCallback(() => {
    if (running || !adminReady) return;
    void fireStart();
  }, [running, adminReady, fireStart]);

  const { status: mic, level, error: micErr, openMic, arm, disarm } = useBangMic(onBang);

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
              {starting ? " · starting…" : null}
            </p>
          </div>
        }
        info="Arm when set… bang starts the race clock. Mic warms early; clap, airhorn, or gun peak tells the server to start. Race clock stays server time."
      />

      <div className="flex min-h-0 flex-1 flex-col justify-center gap-6 px-4 pb-4">
        <p className="text-center text-base font-bold text-dim">
          Arm when set… bang starts the race clock.
        </p>

        <div className="mx-auto w-full max-w-md">
          <div className="h-3 overflow-hidden rounded-full bg-panel2 ring-1 ring-line">
            <div
              className={`h-full rounded-full transition-[width] duration-75 ${
                mic === "armed" ? "bg-bell" : "bg-go"
              }`}
              style={{ width: `${Math.min(100, level * 100)}%` }}
            />
          </div>
          <p className="mt-2 text-center text-xs font-bold uppercase tracking-wider text-dim">
            {micLabel(mic, micErr)}
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
