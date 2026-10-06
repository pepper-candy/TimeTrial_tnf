"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { Screen, TopBar } from "@/components/shell";
import { EmptyState, LoadingState } from "@/components/states";
import { appendBellCallIds, bellCallStatus } from "@/lib/bell";
import { useEvent } from "@/lib/client/hooks";
import { normalizeCode } from "@/lib/ids";
import { buildRunnerRaces } from "@/lib/race";

const INFO = "Runners appear when they start their second-last lap. Tap a row once the bell is rung.";

function orderKey(code: string) {
  return `tt:bell-order:${normalizeCode(code)}`;
}

function rungKey(code: string, runnerId: string) {
  return `tt:bell-rung:${normalizeCode(code)}:${runnerId}`;
}

function readOrder(code: string): string[] {
  try {
    const raw = localStorage.getItem(orderKey(code));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writeOrder(code: string, ids: string[]) {
  try {
    localStorage.setItem(orderKey(code), JSON.stringify(ids));
  } catch {
    /* private mode */
  }
}

function readRung(code: string, runnerId: string): boolean {
  try {
    return localStorage.getItem(rungKey(code, runnerId)) === "1";
  } catch {
    return false;
  }
}

function writeRung(code: string, runnerId: string, on: boolean) {
  try {
    const key = rungKey(code, runnerId);
    if (on) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {
    /* private mode */
  }
}

function buzz() {
  try {
    navigator.vibrate?.(200);
  } catch {
    /* unsupported */
  }
}

export default function BellPage() {
  const { code } = useParams<{ code: string }>();
  const { event, serverNow } = useEvent(code, 1000);
  const races = useMemo(() => (event ? buildRunnerRaces(event) : []), [event]);
  const [order, setOrder] = useState<string[]>([]);
  const [rung, setRung] = useState<Record<string, boolean>>({});
  const orderRef = useRef<string[]>([]);
  const live = useRef(false);

  useEffect(() => {
    live.current = false;
    const ids = readOrder(code);
    orderRef.current = ids;
    setOrder(ids);
    const next: Record<string, boolean> = {};
    for (const id of ids) next[id] = readRung(code, id);
    setRung(next);
  }, [code]);

  useEffect(() => {
    if (!event) return;
    const prev = orderRef.current;
    const merged = appendBellCallIds(prev, races, event.course.requiredCrossings);
    const same = merged.length === prev.length && merged.every((id, i) => id === prev[i]);
    if (same) {
      live.current = true;
      return;
    }
    const added = merged.slice(prev.length);
    orderRef.current = merged;
    setOrder(merged);
    writeOrder(code, merged);
    setRung((cur) => {
      const next = { ...cur };
      for (const id of added) {
        if (next[id] == null) next[id] = readRung(code, id);
      }
      return next;
    });
    if (live.current && added.length) buzz();
    live.current = true;
  }, [code, event, races]);

  function toggle(id: string) {
    setRung((prev) => {
      const on = !prev[id];
      writeRung(code, id, on);
      return { ...prev, [id]: on };
    });
  }

  if (!event) {
    return (
      <Screen>
        <TopBar backHref={`/e/${code}`} title="Bell" info={INFO} />
        <LoadingState />
      </Screen>
    );
  }

  const byId = new Map(races.map((r) => [r.runner.id, r]));
  const rows = order.map((id) => byId.get(id)).filter((r) => r != null);

  return (
    <Screen>
      <TopBar backHref={`/e/${code}`} title="Bell" info={INFO} />
      {rows.length === 0 ? (
        <EmptyState title="No bell calls yet" hint="Runners land here when they start their second-last lap." />
      ) : (
        <ul className="flex flex-col gap-1.5 px-3 pb-8">
          {rows.map((race) => {
            const status = bellCallStatus(race, event.course, serverNow);
            const on = Boolean(rung[race.runner.id]);
            const tone =
              status.kind === "now" && !on
                ? "text-bell"
                : status.kind === "finished" && !on
                  ? "text-go"
                  : "";
            return (
              <li key={race.runner.id}>
                <button
                  type="button"
                  onClick={() => toggle(race.runner.id)}
                  aria-pressed={on}
                  className={`tap flex h-16 w-full items-center gap-3 rounded-2xl px-3 ring-1 ${
                    on ? "bg-go text-ink ring-go" : "bg-panel text-sand ring-line"
                  }`}
                >
                  <span className="w-12 shrink-0 font-mono text-xl font-black tabular">{race.runner.bib}</span>
                  <Avatar runner={race.runner} eventId={event.id} size={48} />
                  <span className="min-w-0 flex-1 truncate text-left text-sm font-bold">
                    {race.runner.name || ""}
                  </span>
                  <span className="grid shrink-0 grid-cols-[8.5ch_1rem] items-center gap-1">
                    <span className={`text-right font-mono text-base font-black tabular leading-none ${tone}`}>
                      {status.label}
                    </span>
                    <span className={`text-center text-sm font-black leading-none ${on ? "" : "invisible"}`}>
                      ✓
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Screen>
  );
}
