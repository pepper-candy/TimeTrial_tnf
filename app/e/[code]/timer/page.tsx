"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { RaceClock } from "@/components/clock";
import { PinGate } from "@/components/pin-gate";
import { Screen, TopBar } from "@/components/shell";
import { json, useEvent } from "@/lib/client/hooks";
import { formatEst } from "@/lib/format";
import { liveTaps } from "@/lib/race";
import { formatStopwatch, tapRows } from "@/lib/tap-list";
import type { EventState, Tap } from "@/lib/types";

const QUEUE_KEY = (code: string) => `tt:tapq:${code}`;

type Queued = Tap & { sent?: boolean };

type Hist =
  | { kind: "tap"; id: string }
  | { kind: "delete"; id: string; local: Queued | null };

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
  const [hist, setHist] = useState<Hist[]>([]);
  const [gone, setGone] = useState<string[]>([]);
  const pending = useRef<Queued[]>([]);
  const sending = useRef(false);
  const origin = useRef(0);
  const offsetRef = useRef(0);
  const histRef = useRef<Hist[]>([]);
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
    histRef.current = hist;
  }, [hist]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void flushRef.current();
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  function remember(entry: Hist) {
    setHist((h) => [...h, entry].slice(-40));
  }

  function tap(e: React.PointerEvent) {
    e.preventDefault();
    const t = Math.round(origin.current + performance.now() + offsetRef.current);
    const item: Queued = { id: crypto.randomUUID(), t, sent: false };
    pending.current.push(item);
    remember({ kind: "tap", id: item.id });
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
    const data = await json<{ event: EventState }>(`/api/events/${code}/start`, {
      method: "POST",
    });
    setEvent(data.event);
  }

  async function undoTap(id: string) {
    const localUnsent = pending.current.find((q) => q.id === id && !q.sent);
    if (localUnsent) {
      pending.current = pending.current.filter((q) => q.id !== id);
      persist();
      return;
    }
    const data = await json<{ event: EventState }>(`/api/events/${code}/taps`, {
      method: "POST",
      body: JSON.stringify({ undo: true, id, actor: "timer" }),
    });
    pending.current = pending.current.filter((q) => q.id !== id);
    persist();
    setEvent(data.event);
  }

  async function deleteTap(id: string) {
    const local = pending.current.find((q) => q.id === id && !q.sent);
    if (local) {
      pending.current = pending.current.filter((q) => q.id !== id);
      persist();
      remember({ kind: "delete", id, local });
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
      remember({ kind: "delete", id, local: null });
    } catch {
      setGone((g) => g.filter((x) => x !== id));
    }
  }

  async function restoreDeleted(item: Extract<Hist, { kind: "delete" }>) {
    setGone((g) => g.filter((x) => x !== item.id));
    if (item.local) {
      pending.current.push(item.local);
      persist();
      void flush();
      return;
    }
    const data = await json<{ event: EventState }>(`/api/events/${code}/taps`, {
      method: "POST",
      body: JSON.stringify({ action: "tap-restore", id: item.id, actor: "timer" }),
    });
    setEvent(data.event);
  }

  async function undo() {
    const last = histRef.current[histRef.current.length - 1];
    if (!last) return;
    setHist((h) => h.slice(0, -1));
    try {
      if (last.kind === "tap") await undoTap(last.id);
      else await restoreDeleted(last);
    } catch {
      remember(last);
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
  const newest = rows[0]?.id ?? "";

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [newest]);

  return (
    <Screen className="h-dvh max-h-dvh max-w-none overflow-hidden">
      <TopBar
        backHref={`/e/${code}`}
        title={
          <RaceClock
            startedAt={event?.startedAt ?? null}
            now={serverNow}
            className="text-3xl sm:text-4xl"
          />
        }
        info="Tap every torso at the line. Delete drops an extra tap. Undo puts back the last tap or the last delete."
      />
      <div className="flex min-h-0 flex-1 flex-col">
        <p className="h-5 shrink-0 text-center text-[11px] font-bold uppercase tracking-[0.16em] text-dim">
          {running ? (
            <>
              {rows.length} {rows.length === 1 ? "tap" : "taps"}
              {queued ? <span className="text-bell"> · {queued} sending</span> : null}
            </>
          ) : null}
        </p>
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-2">
          <ul className="flex flex-col gap-1.5">
            {rows.map((row) => (
              <li
                key={row.id}
                className={`grid grid-cols-[2.5rem_minmax(0,1fr)_auto_2.75rem] items-center gap-2 rounded-xl px-3 py-1.5 ${
                  row.estimated ? "bg-panel ring-1 ring-accent/50" : "bg-panel2"
                }`}
              >
                <span className="font-mono text-sm font-bold tabular text-dim">
                  {String(row.n).padStart(2, "0")}
                </span>
                <span className="truncate text-center font-mono text-sm font-bold tabular text-dim">
                  {formatStopwatch(row.splitMs, true)}
                </span>
                <span className="font-mono text-base font-black tabular">
                  {formatEst(formatStopwatch(row.elapsedMs), row.estimated)}
                </span>
                <button
                  type="button"
                  className="tap grid h-11 w-11 place-items-center rounded-lg text-dim active:bg-sand active:text-ink"
                  aria-label={`Delete tap ${row.n}`}
                  onClick={() => void deleteTap(row.id)}
                >
                  <TrashIcon />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="shrink-0 px-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <button
          type="button"
          className="tap mb-2 h-12 w-full rounded-[12px] bg-panel2 text-base font-black uppercase tracking-[0.14em] ring-1 ring-line disabled:cursor-default disabled:text-dim/40 disabled:ring-line/50"
          onClick={() => void undo()}
          disabled={hist.length === 0}
        >
          Undo
        </button>
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
        ) : (
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
        )}
      </div>
    </Screen>
  );
}

function TrashIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M8 7l1 13h6l1-13" />
    </svg>
  );
}
