"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { buildRunnerRaces, collectFlags, predictedTileOrder } from "@/lib/race";
import { computeRunnerStats } from "@/lib/stats";
import type { EventState } from "@/lib/types";

export function useClockOffset() {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    let alive = true;
    async function ping() {
      const t0 = Date.now();
      try {
        const res = await fetch("/api/clock", { cache: "no-store" });
        const data = (await res.json()) as { now: number };
        const t1 = Date.now();
        if (alive) setOffset(data.now + (t1 - t0) / 2 - t1);
      } catch {
        /* keep last offset */
      }
    }
    const start = setTimeout(ping, 0);
    const id = setInterval(ping, 20_000);
    return () => {
      alive = false;
      clearTimeout(start);
      clearInterval(id);
    };
  }, []);
  return offset;
}

export function useEvent(code: string, intervalMs = 1000) {
  const [event, setEvent] = useState<EventState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const offset = useClockOffset();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${code}`, { cache: "no-store" });
      if (res.status === 404) {
        setError("missing");
        return;
      }
      const data = (await res.json()) as { event: EventState };
      setEvent(data.event);
      setError(null);
    } catch {
      setError("net");
    }
  }, [code]);

  useEffect(() => {
    const kick = setTimeout(() => {
      void refresh();
    }, 0);
    const id = setInterval(() => {
      void refresh();
    }, intervalMs);
    return () => {
      clearTimeout(kick);
      clearInterval(id);
    };
  }, [refresh, intervalMs]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);

  const serverNow = now + offset;
  const races = useMemo(
    () => (event ? buildRunnerRaces(event, serverNow) : []),
    [event, serverNow],
  );
  const tiles = useMemo(() => predictedTileOrder(races), [races]);
  const flags = useMemo(
    () => (event ? collectFlags(event, races) : []),
    [event, races],
  );
  const leader = races[0] ?? null;
  const stats = useMemo(
    () => (event ? races.map((r) => computeRunnerStats(event, r, leader)) : []),
    [races, event, leader],
  );

  return {
    event,
    error,
    refresh,
    setEvent,
    offset,
    serverNow,
    races,
    tiles,
    flags,
    stats,
    leader,
  };
}

export async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json() as Promise<T>;
}
