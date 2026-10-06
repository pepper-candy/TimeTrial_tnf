"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { BigBtn, Screen, TopBar } from "@/components/shell";
import { EmptyState, LoadingState } from "@/components/states";
import {
  expectedLastLapStartMs,
  formatBellCountdown,
  loadBellOrder,
  loadBellRung,
  onBellCallList,
  saveBellOrder,
  setBellRung,
  vibrateBell,
} from "@/lib/bell";
import { useEvent } from "@/lib/client/hooks";
import { buildRunnerRaces, type RunnerRace } from "@/lib/race";
import type { CourseConfig } from "@/lib/types";

const INFO = "Runners appear when they start their second-last lap. Tap a row once the bell is rung.";

export default function BellPage() {
  const { code } = useParams<{ code: string }>();
  const { event, error, serverNow } = useEvent(code, 1000);
  const races = useMemo(() => (event ? buildRunnerRaces(event) : []), [event]);
  const [order, setOrder] = useState<string[]>([]);
  const [rung, setRung] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);
  const primed = useRef(false);
  const orderRef = useRef<string[]>([]);

  useEffect(() => {
    primed.current = false;
    const ids = loadBellOrder(code);
    orderRef.current = ids;
    setOrder(ids);
    setRung(loadBellRung(code, ids));
    setHydrated(true);
  }, [code]);

  useEffect(() => {
    if (!hydrated || !event) return;
    const have = new Set(orderRef.current);
    const added = races
      .filter((r) => onBellCallList(r, event.course.requiredCrossings) && !have.has(r.runner.id))
      .map((r) => r.runner.id);
    if (added.length === 0) {
      primed.current = true;
      return;
    }
    if (primed.current) vibrateBell();
    primed.current = true;
    const next = [...orderRef.current, ...added];
    orderRef.current = next;
    setOrder(next);
    saveBellOrder(code, next);
  }, [hydrated, event, races, code]);

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

  if (!event || !hydrated) {
    return (
      <Screen>
        <TopBar backHref={`/e/${code}`} title="Bell" />
        <LoadingState rows={6} />
      </Screen>
    );
  }

  const byId = new Map(races.map((r) => [r.runner.id, r]));

  function toggleRung(id: string) {
    setRung((prev) => {
      const next = new Set(prev);
      const on = !next.has(id);
      if (on) next.add(id);
      else next.delete(id);
      setBellRung(code, id, on);
      return next;
    });
  }

  return (
    <Screen>
      <TopBar backHref={`/e/${code}`} title="Bell" info={INFO} />
      {order.length === 0 ? (
        <EmptyState title="No bell yet" hint="Runners appear when they start their second-last lap." />
      ) : (
        <div className="flex flex-col gap-2 px-4 pb-8">
          {order.map((id) => {
            const race = byId.get(id);
            if (!race) return null;
            return (
              <BellRow
                key={id}
                race={race}
                eventId={event.id}
                now={serverNow}
                course={event.course}
                rung={rung.has(id)}
                onToggle={() => toggleRung(id)}
              />
            );
          })}
        </div>
      )}
    </Screen>
  );
}

function BellRow({
  race,
  eventId,
  now,
  course,
  rung,
  onToggle,
}: {
  race: RunnerRace;
  eventId: string;
  now: number;
  course: CourseConfig;
  rung: boolean;
  onToggle: () => void;
}) {
  const status = bellStatus(race, course, now);
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`tap flex h-16 w-full items-center gap-3 rounded-2xl px-3 ring-1 ${
        rung ? "bg-go text-ink ring-go" : "bg-panel text-sand ring-line"
      }`}
    >
      <span className={`w-4 shrink-0 text-sm font-black ${rung ? "opacity-100" : "opacity-0"}`} aria-hidden>
        ✓
      </span>
      <span className="w-10 shrink-0 text-left font-mono text-xl font-black tabular">{race.runner.bib}</span>
      <Avatar runner={race.runner} eventId={eventId} size={40} />
      <span className="min-w-0 flex-1 truncate text-left text-base font-bold">
        {race.runner.name || ""}
      </span>
      <span
        className={`w-[8ch] shrink-0 text-right font-mono text-base font-black tabular ${
          status.tone === "bell" && !rung ? "text-bell" : ""
        }`}
      >
        {status.label}
      </span>
    </button>
  );
}

function bellStatus(
  race: RunnerRace,
  course: CourseConfig,
  now: number,
): { label: string; tone: "plain" | "bell" } {
  if (race.finished) return { label: "Finished", tone: "plain" };
  if (race.bell) return { label: "Bell lap", tone: "plain" };
  const expected = expectedLastLapStartMs(race, course);
  if (expected == null) return { label: "—", tone: "plain" };
  const left = expected - now;
  if (left <= 0) return { label: "Now", tone: "bell" };
  return { label: formatBellCountdown(left), tone: "plain" };
}
