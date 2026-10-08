"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { RaceClock } from "@/components/clock";
import { SwipeRow } from "@/components/swipe-row";
import { PinGate } from "@/components/pin-gate";
import { Screen, TopBar } from "@/components/shell";
import { useHardwareKeys } from "@/lib/client/hardware-keys";
import { json, useEvent } from "@/lib/client/hooks";
import { formatEst } from "@/lib/format";
import { liveMarks, liveTaps } from "@/lib/race";
import { hapticHoldOk, hapticTap } from "@/lib/haptic";
import { IDLE_GAP_MS, formatStopwatch, sinceLastSync, tapRows } from "@/lib/tap-list";
import type { EventState, Tap } from "@/lib/types";

const QUEUE_KEY = (code: string) => `tt:tapq:${code}`;
const GROUP_HOLD_MS = 500;

type Queued = Tap & { sent?: boolean };

export default function TimerPage() {
  const { code } = useParams<{ code: string }>();
  return (
    <PinGate code={code}>
      <TimerInner code={code} />
    </PinGate>
  );
}

function TimerInner({ code }: { code: string }) {
  const { event, setEvent, offset, serverNow } = useEvent(code, 1500);
  const [flash, setFlash] = useState(false);
  const [queued, setQueued] = useState(0);
  const [localTaps, setLocalTaps] = useState<Queued[]>([]);
  const [gone, setGone] = useState<string[]>([]);
  const pending = useRef<Queued[]>([]);
  const sending = useRef(false);
  const origin = useRef(0);
  const offsetRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const flushRef = useRef<() => Promise<void>>(async () => {});
  const [tick, setTick] = useState(0);
  const idleBusy = useRef(false);
  const groupHold = useRef<number | null>(null);
  const groupArmed = useRef(false);
  const [groupReady, setGroupReady] = useState(false);
  const canIdleRef = useRef(false);

  useEffect(() => {
    origin.current = Date.now() - performance.now();
  }, []);
  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        const raw = localStorage.getItem(QUEUE_KEY(code));
        if (raw) {
          pending.current = JSON.parse(raw) as Queued[];
          const unsent = pending.current.filter((q) => !q.sent);
          setQueued(unsent.length);
          setLocalTaps(unsent);
        }
      } catch {
        /* ignore */
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, [code]);

  const persist = useCallback(() => {
    localStorage.setItem(QUEUE_KEY(code), JSON.stringify(pending.current.slice(-200)));
    const unsent = pending.current.filter((q) => !q.sent);
    setQueued(unsent.length);
    setLocalTaps(unsent);
  }, [code]);

  const flush = useCallback(async () => {
    if (sending.current) return;
    const batch = pending.current.filter((q) => !q.sent);
    if (batch.length === 0) return;
    sending.current = true;
    try {
      const data = await json<{ event: EventState }>(`/api/events/${code}/taps`, {
        method: "POST",
        body: JSON.stringify({ taps: batch.map(({ id, t }) => ({ id, t })), actor: "timer" }),
      });
      const ok = new Set(batch.map((q) => q.id));
      pending.current = pending.current.map((q) => (ok.has(q.id) ? { ...q, sent: true } : q));
      persist();
      setEvent(data.event);
    } catch {
      window.setTimeout(() => {
        sending.current = false;
        void flushRef.current();
      }, 800);
      return;
    } finally {
      sending.current = false;
    }
    if (pending.current.some((q) => !q.sent)) void flushRef.current();
  }, [code, setEvent, persist]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void flushRef.current();
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  function fireTap() {
    const t = Math.round(origin.current + performance.now() + offsetRef.current);
    const item: Queued = { id: crypto.randomUUID(), t, sent: false };
    pending.current.push(item);
    persist();
    setFlash(true);
    window.setTimeout(() => setFlash(false), 70);
    hapticTap();
    void flush();
  }

  function wallNow() {
    return Math.round(origin.current + performance.now() + offsetRef.current);
  }

  async function start() {
    if (!event?.ready) return;
    const data = await json<{ event: EventState }>(`/api/events/${code}/start`, {
      method: "POST",
    });
    setEvent(data.event);
  }

  async function fireIdle() {
    if (!event || idleBusy.current) return;
    const times = [
      ...liveTaps(event.taps).map((x) => x.t),
      ...pending.current.filter((q) => !q.sent).map((q) => q.t),
    ];
    if (times.length === 0) return;
    const lastTapT = Math.max(...times);
    const lastIdleT = Math.max(0, ...(event.idles ?? []).map((x) => x.t));
    const t = wallNow();
    if (lastTapT <= lastIdleT || t - lastTapT < IDLE_GAP_MS) return;
    idleBusy.current = true;
    const idle = { id: crypto.randomUUID(), t };
    setEvent({ ...event, idles: [...(event.idles ?? []), idle] });
    try {
      const data = await json<{ event: EventState }>(`/api/events/${code}/taps`, {
        method: "POST",
        body: JSON.stringify({ action: "idle", t, actor: "timer" }),
      });
      setEvent(data.event);
    } catch {
      setEvent(event);
    } finally {
      idleBusy.current = false;
    }
  }

  async function deleteTap(id: string) {
    const local = pending.current.find((q) => q.id === id && !q.sent);
    if (local) {
      pending.current = pending.current.filter((q) => q.id !== id);
      persist();
      return;
    }
    setGone((g) => (g.includes(id) ? g : [...g, id]));
    try {
      const data = await json<{ event: EventState }>(`/api/events/${code}/taps`, {
        method: "POST",
        body: JSON.stringify({ action: "tap-delete", id, actor: "timer" }),
      });
      pending.current = pending.current.filter((q) => q.id !== id);
      persist();
      setEvent(data.event);
    } catch {
      setGone((g) => g.filter((x) => x !== id));
    }
  }

  const serverTaps = event ? liveTaps(event.taps) : [];
  const known = new Set(serverTaps.map((t) => t.id));
  const extra = localTaps.filter((q) => !known.has(q.id));
  const hidden = new Set(gone);
  const rows = event
    ? tapRows(event, [...serverTaps, ...extra]).filter((r) => !hidden.has(r.id))
    : [];
  const afterCut = sinceLastSync(
    event ? liveTaps(event.taps).length + extra.length : 0,
    event ? liveMarks(event.marks).length : 0,
    event?.syncs,
  );
  const running = event?.status === "running" && event.startedAt != null;
  const adminReady = Boolean(event?.ready);
  const newest = rows[0]?.id ?? "";
  const lastTapT = rows[0]?.t ?? null;
  const lastIdleT = Math.max(0, ...(event?.idles ?? []).map((x) => x.t));
  const waitingIdle = lastTapT != null && lastTapT > lastIdleT;
  const remainMs = waitingIdle ? Math.max(0, IDLE_GAP_MS - (wallNow() - lastTapT)) : IDLE_GAP_MS;
  const canIdle = waitingIdle && remainMs <= 0;
  canIdleRef.current = canIdle;

  function clearGroupHold() {
    if (groupHold.current) window.clearTimeout(groupHold.current);
    groupHold.current = null;
    groupArmed.current = false;
    setGroupReady(false);
  }

  function beginTap(e: React.PointerEvent<HTMLButtonElement>) {
    e.preventDefault();
    if (!canIdleRef.current) {
      fireTap();
      return;
    }
    groupArmed.current = false;
    setGroupReady(false);
    if (groupHold.current) window.clearTimeout(groupHold.current);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    groupHold.current = window.setTimeout(() => {
      groupArmed.current = true;
      setGroupReady(true);
    }, GROUP_HOLD_MS);
  }

  function endTap(commit: boolean) {
    const armed = groupArmed.current;
    const holding = groupHold.current != null || armed;
    clearGroupHold();
    if (!commit || !holding) return;
    if (armed) {
      hapticHoldOk();
      void fireIdle();
    } else fireTap();
  }

  useEffect(() => {
    return () => {
      if (groupHold.current) window.clearTimeout(groupHold.current);
    };
  }, []);

  useEffect(() => {
    if (!running || !waitingIdle || remainMs <= 0) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, [running, waitingIdle, remainMs]);
  void tick;

  useHardwareKeys((e) => {
    if (e.repeat) return false;
    if (e.key !== " " && e.key !== "Enter") return false;
    if (running) fireTap();
    else if (adminReady) void start();
    else return false;
    return true;
  });

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [newest]);

  return (
    <Screen className="h-dvh max-h-dvh max-w-none overflow-hidden">
      <TopBar
        className="!mb-0"
        backHref={`/e/${code}`}
        title={
          <div className="flex flex-col items-center leading-none">
            <RaceClock
              startedAt={event?.startedAt ?? null}
              now={serverNow}
              className="text-3xl sm:text-4xl"
            />
            <p className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.16em] text-dim">
              {afterCut.taps} taps · {afterCut.marks} bibs
              {queued ? <span className="text-bell"> · {queued} sending</span> : null}
            </p>
          </div>
        }
        info="Tap every torso at the line. After four seconds the pad shows Make Grouping; hold TAP to mark a pack break. Swipe a row to drop an extra tap."
      />
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-0.5 pb-2">
          <ul className="flex flex-col gap-1.5">
            {rows.map((row, i) => {
              const sameAbove = i > 0 && rows[i - 1].pack === row.pack;
              const sameBelow = i < rows.length - 1 && rows[i + 1].pack === row.pack;
              return (
              <li key={row.id} className={`relative pl-4 ${row.cutBefore ? "pt-3" : ""}`}>
                {row.cutBefore ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute left-[18px] right-[2px] top-[5px] z-10 h-[3px] rounded-full bg-sky"
                  />
                ) : null}
                <span
                  aria-hidden
                  className="absolute left-0 w-[9px] rounded-full bg-go"
                  style={{
                    top: sameAbove ? "-0.5rem" : "0.15rem",
                    bottom: sameBelow ? "-0.5rem" : "0.15rem",
                  }}
                />
                <SwipeRow
                  label={`Delete tap ${row.n}`}
                  onDelete={() => void deleteTap(row.id)}
                  className={`min-h-11 rounded-xl ${
                    row.estimated ? "bg-panel ring-1 ring-accent/50" : "bg-panel2"
                  }`}
                >
                  <div className="grid min-h-11 grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-2 px-3 py-1.5">
                    <span className="font-mono text-sm font-bold tabular text-dim">
                      {String(row.n).padStart(2, "0")}
                    </span>
                    <span className="truncate text-center font-mono text-sm font-bold tabular text-dim">
                      {formatStopwatch(row.splitMs, true)}
                    </span>
                    <span className="font-mono text-base font-black tabular">
                      {formatEst(formatStopwatch(row.elapsedMs), row.estimated)}
                    </span>
                  </div>
                </SwipeRow>
              </li>
              );
            })}
          </ul>
      </div>
      <div className="shrink-0 rounded-t-3xl bg-[color-mix(in_srgb,var(--color-panel2)_40%,var(--color-panel))] px-3 pt-4 pb-[max(12px,env(safe-area-inset-bottom))]">
        {running ? (
          <button
            type="button"
            className={`tap flex h-[42dvh] w-full flex-col items-center justify-center gap-3 rounded-[2rem] ${
              flash ? "bg-sand text-ink" : groupReady ? "bg-go text-ink" : "bg-accent text-ink"
            }`}
            onPointerDown={beginTap}
            onPointerUp={() => endTap(true)}
            onPointerCancel={() => endTap(false)}
            onContextMenu={(e) => e.preventDefault()}
          >
            <span className="text-7xl font-black tracking-tight">TAP</span>
            <span
              className={`font-black ${
                waitingIdle && remainMs > 0 ? "text-2xl text-ink/70" : canIdle ? "text-xl text-ink" : "text-xl text-ink/40"
              }`}
            >
              {waitingIdle && remainMs > 0
                ? `Enable Grouping in ${Math.ceil(remainMs / 1000)}`
                : canIdle
                  ? "Make Grouping (HOLD)"
                  : "Separated"}
            </span>
          </button>
        ) : adminReady ? (
          <button
            type="button"
            className="tap flex h-[42dvh] w-full items-center justify-center rounded-[2rem] bg-go text-5xl font-black text-ink"
            onPointerDown={(e) => {
              e.preventDefault();
              void start();
            }}
          >
            START
          </button>
        ) : (
          <button
            type="button"
            disabled
            className="tap flex h-[42dvh] w-full flex-col items-center justify-center gap-2 rounded-[2rem] bg-panel2 text-dim"
          >
            <span className="text-5xl font-black">WAITING</span>
            <span className="text-base font-bold">Waiting Event to be Ready</span>
          </button>
        )}
      </div>
    </Screen>
  );
}
