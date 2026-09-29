"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getStoredPin } from "@/lib/client/pin";
import { advanceDemo, raceNow } from "@/lib/demo-run";
import { normalizeCode } from "@/lib/ids";
import { buildRunnerRaces, collectFlags, predictedTileOrder } from "@/lib/race";
import { computeRunnerStats } from "@/lib/stats";
import type { EventState } from "@/lib/types";

export function useEvent(code: string, intervalMs = 1000) {
  const [event, setEvent] = useState<EventState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [offset, setOffset] = useState(0);
  const revRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    const t0 = Date.now();
    try {
      const q = revRef.current != null ? `?v=${revRef.current}` : "";
      const res = await fetch(`/api/events/${code}${q}`, { cache: "no-store" });
      const t1 = Date.now();
      if (res.status === 404) {
        setError("missing");
        return;
      }
      const data = (await res.json()) as {
        unchanged?: boolean;
        event?: EventState;
        rev?: number;
        now: number;
      };
      setOffset(data.now + (t1 - t0) / 2 - t1);
      if (data.unchanged) {
        setError(null);
        return;
      }
      if (data.event) {
        revRef.current = data.rev ?? data.event.rev;
        setEvent(data.event);
        setError(null);
      }
    } catch {
      setError("net");
    }
  }, [code]);

  useEffect(() => {
    revRef.current = null;
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
  const clockNow = useMemo(
    () => (event ? raceNow(event, serverNow) : serverNow),
    [event, serverNow],
  );
  const live = useMemo(() => {
    if (!event) return null;
    return event.demo ? advanceDemo(event, clockNow) : event;
  }, [event, clockNow]);

  const races = useMemo(
    () => (live ? buildRunnerRaces(live, clockNow) : []),
    [live, clockNow],
  );
  const tiles = useMemo(() => predictedTileOrder(races), [races]);
  const flags = useMemo(
    () => (live ? collectFlags(live, races) : []),
    [live, races],
  );
  const leader = races[0] ?? null;
  const stats = useMemo(
    () => (live ? races.map((r) => computeRunnerStats(live, r, leader)) : []),
    [races, live, leader],
  );

  const setEventAndRev = useCallback((next: EventState | null) => {
    if (next) revRef.current = next.rev;
    setEvent(next);
  }, []);

  return {
    event: live,
    error,
    refresh,
    setEvent: setEventAndRev,
    offset,
    serverNow: clockNow,
    races,
    tiles,
    flags,
    stats,
    leader,
  };
}

function pinHeaders(url: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  const m = url.match(/\/api\/events\/([^/?]+)/);
  if (!m) return {};
  const pin = getStoredPin(normalizeCode(m[1]));
  return pin ? { "X-TT-PIN": pin } : {};
}

export async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...pinHeaders(url),
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json() as Promise<T>;
}

export async function fetchWithPin(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      ...pinHeaders(url),
      ...(init?.headers || {}),
    },
  });
}
