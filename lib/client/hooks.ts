"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getMasterKey, getStoredPin } from "@/lib/client/pin";
import { advanceDemo, raceNow } from "@/lib/demo-run";
import { normalizeCode } from "@/lib/ids";
import { buildRunnerRaces } from "@/lib/race";
import { computeRunnerStats } from "@/lib/stats";
import type { EventState } from "@/lib/types";

export function useEvent(code: string, intervalMs = 1000) {
  const [event, setEvent] = useState<EventState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [offset, setOffset] = useState(0);
  const revRef = useRef<number | null>(null);

  /**
   * Poll once. Returns the estimated server time (ms) for this round trip, or
   * `null` on 404 / network failure — Finish Cam uses it to stamp `recServerAt`
   * fresh right before recording.
   */
  const refresh = useCallback(async (): Promise<number | null> => {
    const t0 = Date.now();
    try {
      const q = revRef.current != null ? `?v=${revRef.current}` : "";
      const res = await fetch(`/api/events/${code}${q}`, { cache: "no-store" });
      const t1 = Date.now();
      if (res.status === 404) {
        setError("missing");
        return null;
      }
      const data = (await res.json()) as {
        unchanged?: boolean;
        event?: EventState;
        rev?: number;
        now: number;
      };
      const nextOffset = data.now + (t1 - t0) / 2 - t1;
      setOffset(nextOffset);
      if (data.unchanged) {
        setError(null);
        return Math.round(t1 + nextOffset);
      }
      if (data.event) {
        revRef.current = data.rev ?? data.event.rev;
        setEvent(data.event);
        setError(null);
      }
      return Math.round(t1 + nextOffset);
    } catch {
      setError("net");
      return null;
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
    () => (live ? buildRunnerRaces(live) : []),
    [live, clockNow],
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
    setEvent: setEventAndRev,
    /** Poll once now; resolves to estimated server time (ms) or null. */
    refresh,
    offset,
    serverNow: clockNow,
    races,
    stats,
  };
}

function pinHeaders(url: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  const m = url.match(/\/api\/events\/([^/?]+)/);
  if (!m) return {};
  const headers: Record<string, string> = {};
  const pin = getStoredPin(normalizeCode(m[1]));
  if (pin) headers["X-TT-PIN"] = pin;
  const key = getMasterKey();
  if (key) headers["X-TT-KEY"] = key;
  return headers;
}

/** True when this device holds a PIN or master key for the event (helper tools visible). */
export function hasHelperCreds(code: string): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(getStoredPin(code) || getMasterKey());
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
