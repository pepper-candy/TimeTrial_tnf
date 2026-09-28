"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { RaceClock } from "@/components/clock";
import { PinGate } from "@/components/pin-gate";
import { HelpTip, Screen } from "@/components/shell";
import { UndoToast } from "@/components/undo-toast";
import { json, useEvent } from "@/lib/client/hooks";
import { formatClock, formatEst } from "@/lib/format";
import { liveTaps, tapElapsed, unmatchedTaps } from "@/lib/race";
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
  const [toast, setToast] = useState<{ id: string; label: string } | null>(null);
  const pending = useRef<Queued[]>([]);
  const sending = useRef(false);
  const origin = useRef(0);
  const offsetRef = useRef(0);
  const lastId = useRef<string | null>(null);
  const localGone = useRef<Queued | null>(null);
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
          setQueued(pending.current.filter((q) => !q.sent).length);
        }
      } catch {
        /* ignore */
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, [code]);

  const persist = useCallback(() => {
    localStorage.setItem(QUEUE_KEY(code), JSON.stringify(pending.current.slice(-200)));
    setQueued(pending.current.filter((q) => !q.sent).length);
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
    lastId.current = item.id;
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

  async function undoLast() {
    const localUnsent = [...pending.current].reverse().find((q) => !q.sent);
    if (localUnsent) {
      pending.current = pending.current.filter((q) => q.id !== localUnsent.id);
      persist();
      return;
    }
    const last = pending.current[pending.current.length - 1];
    const id = last?.id ?? lastId.current ?? undefined;
    const data = await json<{ event: EventState }>(`/api/events/${code}/taps`, {
      method: "POST",
      body: JSON.stringify({ undo: true, id, actor: "timer" }),
    });
    if (id) pending.current = pending.current.filter((q) => q.id !== id);
    persist();
    setEvent(data.event);
  }

  async function deleteTap(id: string) {
    const local = pending.current.find((q) => q.id === id && !q.sent);
    if (local) {
      localGone.current = local;
      pending.current = pending.current.filter((q) => q.id !== id);
      persist();
      setToast({ id, label: "Tap deleted" });
      return;
    }
    const data = await json<{ event: EventState }>(`/api/events/${code}/taps`, {
      method: "POST",
      body: JSON.stringify({ action: "tap-delete", id, actor: "timer" }),
    });
    pending.current = pending.current.filter((q) => q.id !== id);
    persist();
    setEvent(data.event);
    setToast({ id, label: "Tap deleted" });
  }

  async function restoreTap(id: string) {
    if (localGone.current?.id === id) {
      pending.current.push(localGone.current);
      localGone.current = null;
      persist();
      setToast(null);
      void flush();
      return;
    }
    const data = await json<{ event: EventState }>(`/api/events/${code}/taps`, {
      method: "POST",
      body: JSON.stringify({ action: "tap-restore", id, actor: "timer" }),
    });
    setEvent(data.event);
    setToast(null);
  }

  async function insertEstimated(beforeId?: string) {
    const data = await json<{ event: EventState }>(`/api/events/${code}/taps`, {
      method: "POST",
      body: JSON.stringify({ action: "tap-insert-estimated", beforeId, actor: "timer" }),
    });
    setEvent(data.event);
  }

  const live = event ? liveTaps(event.taps) : [];
  const extraIds = new Set(event ? unmatchedTaps(event.taps, event.marks).map((t) => t.id) : []);
  const extra = extraIds.size;
  const recent = live.slice(-8);
  const running = event?.status === "running" && event.startedAt != null;

  return (
    <Screen className="max-w-none">
      <div className="flex items-center gap-2 px-3 py-2">
        <a
          href={`/e/${code}`}
          className="tap grid h-11 w-11 place-items-center rounded-xl bg-panel2 text-lg font-semibold ring-1 ring-line"
        >
          ←
        </a>
        <RaceClock
          startedAt={event?.startedAt ?? null}
          now={serverNow}
          className="flex-1 text-center text-3xl sm:text-4xl"
        />
        <button
          type="button"
          className="tap h-11 rounded-xl bg-panel2 px-3 text-sm font-black ring-1 ring-line"
          onClick={() => void undoLast()}
        >
          Undo
        </button>
        <HelpTip text="Tap every torso — extra is easy to delete, a miss loses the true time. Tap a recent time to drop it. +~ inserts a guessed tap (shown as ~, skipped for fastest lap)." />
      </div>
      <div className="px-3 pb-1 text-center font-mono text-sm font-black tabular text-dim">
        {live.length}
        {queued ? ` · ${queued}` : ""}
        {extra ? <span className="text-stop"> · {extra} extra</span> : null}
      </div>
      {running && event ? (
        <div className="mx-3 mb-1 flex items-stretch gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            className="tap h-14 shrink-0 rounded-xl bg-panel2 px-3 text-sm font-black text-gold ring-1 ring-line"
            onClick={() => void insertEstimated()}
          >
            +~
          </button>
          {recent.map((t) => {
            const extraTap = extraIds.has(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => void deleteTap(t.id)}
                className={`tap h-14 shrink-0 rounded-xl px-3 text-left ring-1 ${
                  extraTap ? "bg-stop/20 ring-stop" : t.estimated ? "bg-panel ring-gold/60" : "bg-panel ring-line"
                }`}
              >
                <div className="font-mono text-lg font-black tabular leading-none">
                  {formatEst(formatClock(tapElapsed(event, t)), t.estimated)}
                </div>
                <div className={`mt-1 text-[10px] font-black uppercase tracking-wide ${extraTap ? "text-stop" : "text-dim"}`}>
                  {extraTap ? "Extra" : t.estimated ? "Est" : "Tap"}
                </div>
              </button>
            );
          })}
        </div>
      ) : null}
      {running ? (
        <button
          type="button"
          className={`tap m-3 flex flex-1 items-center justify-center rounded-[2rem] text-7xl font-black tracking-tight ${
            flash ? "bg-sand text-ink" : "bg-gold text-ink"
          }`}
          onPointerDown={tap}
        >
          TAP
        </button>
      ) : (
        <button
          type="button"
          className="tap m-3 flex flex-1 items-center justify-center rounded-[2rem] bg-go text-5xl font-black text-ink"
          onPointerDown={(e) => {
            e.preventDefault();
            void start();
          }}
        >
          START
        </button>
      )}
      {toast ? (
        <UndoToast
          key={toast.id}
          message={toast.label}
          onUndo={() => void restoreTap(toast.id)}
          onGone={() => setToast(null)}
        />
      ) : null}
    </Screen>
  );
}
