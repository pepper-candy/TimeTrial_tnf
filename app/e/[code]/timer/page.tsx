"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { RaceClock } from "@/components/clock";
import { SwipeRow } from "@/components/swipe-row";
import { PinGate } from "@/components/pin-gate";
import { Screen, TopBar } from "@/components/shell";
import { json, useEvent } from "@/lib/client/hooks";
import { formatEst } from "@/lib/format";
import { liveTaps } from "@/lib/race";
import { formatStopwatch, tapRows } from "@/lib/tap-list";
import type { EventState, Tap } from "@/lib/types";

const QUEUE_KEY = (code: string) => `tt:tapq:${code}`;

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

  function tap(e: React.PointerEvent) {
    e.preventDefault();
    const t = Math.round(origin.current + performance.now() + offsetRef.current);
    const item: Queued = { id: crypto.randomUUID(), t, sent: false };
    pending.current.push(item);
    persist();
    setFlash(true);
    window.setTimeout(() => setFlash(false), 70);
    try {
      navigator.vibrate?.(18);
    } catch {
      /* ignore */
    }
    void flush();
  }

  async function start() {
    if (!event?.ready) return;
    const data = await json<{ event: EventState }>(`/api/events/${code}/start`, {
      method: "POST",
    });
    setEvent(data.event);
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
  const running = event?.status === "running" && event.startedAt != null;
  const adminReady = Boolean(event?.ready);
  const newest = rows[0]?.id ?? "";

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
            {running ? (
              <p className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.16em] text-dim">
                {rows.length} {rows.length === 1 ? "tap" : "taps"}
                {queued ? <span className="text-bell"> · {queued} sending</span> : null}
              </p>
            ) : null}
          </div>
        }
        info="Tap every torso at the line. Swipe a row to drop an extra tap."
      />
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-0.5 pb-2">
          <ul className="flex flex-col gap-1.5">
            {rows.map((row) => (
              <li key={row.id}>
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
            ))}
          </ul>
      </div>
      <div className="shrink-0 rounded-t-3xl bg-[color-mix(in_srgb,var(--color-panel2)_40%,var(--color-panel))] px-3 pt-4 pb-[max(12px,env(safe-area-inset-bottom))]">
        {running ? (
          <button
            type="button"
            className={`tap flex h-[42dvh] w-full items-center justify-center rounded-[2rem] text-7xl font-black tracking-tight ${
              flash ? "bg-sand text-ink" : "bg-accent text-ink"
            }`}
            onPointerDown={tap}
          >
            TAP
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

