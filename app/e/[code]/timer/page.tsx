"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { RaceClock } from "@/components/clock";
import { HelpTip, Screen } from "@/components/shell";
import { json, useEvent } from "@/lib/client/hooks";
import type { EventState, Tap } from "@/lib/types";

const QUEUE_KEY = (code: string) => `tt:tapq:${code}`;

type Queued = Tap & { sent?: boolean };

export default function TimerPage() {
  const { code } = useParams<{ code: string }>();
  const { event, setEvent, offset, serverNow } = useEvent(code, 1500);
  const [flash, setFlash] = useState(false);
  const [queued, setQueued] = useState(0);
  const pending = useRef<Queued[]>([]);
  const sending = useRef(false);
  const origin = useRef(0);
  const offsetRef = useRef(0);
  const lastId = useRef<string | null>(null);
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
        body: JSON.stringify({ taps: batch.map(({ id, t }) => ({ id, t })) }),
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

  async function undo() {
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
      body: JSON.stringify({ undo: true, id }),
    });
    if (id) pending.current = pending.current.filter((q) => q.id !== id);
    persist();
    setEvent(data.event);
  }

  const count = event?.taps.length ?? 0;
  const running = event?.status === "running" && event.startedAt != null;

  return (
    <Screen className="max-w-none">
      <div className="flex items-center gap-2 px-3 py-2">
        <a
          href={`/e/${code}`}
          className="tap grid h-11 w-11 place-items-center rounded-xl bg-panel2 text-lg font-semibold"
        >
          ←
        </a>
        <RaceClock
          startedAt={event?.startedAt ?? null}
          now={serverNow}
          className="flex-1 text-center text-2xl"
        />
        <button
          type="button"
          className="tap h-11 rounded-xl bg-panel2 px-3 text-sm font-semibold"
          onClick={undo}
        >
          Undo
        </button>
        <HelpTip text="Tap every torso at the line. Two runners 0.2s apart = two taps. Undo drops the last tap." />
      </div>
      <div className="px-3 pb-1 text-center font-mono text-sm text-dim">
        {count}
        {queued ? ` · ${queued}` : ""}
      </div>
      {running ? (
        <button
          type="button"
          className={`tap m-3 flex flex-1 items-center justify-center rounded-[2rem] text-6xl font-black tracking-tight ${
            flash ? "bg-sand text-ink" : "bg-gold text-ink"
          }`}
          onPointerDown={tap}
        >
          TAP
        </button>
      ) : (
        <button
          type="button"
          className="tap m-3 flex flex-1 items-center justify-center rounded-[2rem] bg-go text-4xl font-black text-ink"
          onPointerDown={(e) => {
            e.preventDefault();
            void start();
          }}
        >
          START
        </button>
      )}
    </Screen>
  );
}
