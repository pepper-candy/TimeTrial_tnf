"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { BigBtn, Chip, Screen, TopBar, useCopied } from "@/components/shell";
import { PinGate } from "@/components/pin-gate";
import { EmptyState, LoadingState } from "@/components/states";
import { fetchWithPin, useEvent } from "@/lib/client/hooks";
import { formatClock, formatClubMs, formatEst, formatPace } from "@/lib/format";
import type { RunnerRace } from "@/lib/race";
import {
  formatConsistencyPct,
  formatLapsShort,
  formatResultsText,
  lapsCompleted,
  type ResultsStyle,
} from "@/lib/results";
import {
  consistencyPctOf,
  fastestSlowestLap,
  fullLapsFor,
  halfSplitFor,
  kmMarksFor,
  type KmMark,
  type RunnerStats,
} from "@/lib/stats";
import type { EventState } from "@/lib/types";

export default function StatsPage() {
  const { code } = useParams<{ code: string }>();
  return (
    <PinGate code={code}>
      <StatsInner code={code} />
    </PinGate>
  );
}

function StatsInner({ code }: { code: string }) {
  const { event, races, stats } = useEvent(code, 2000);
  const { copied, copy } = useCopied(1500);
  const [style, setStyle] = useState<ResultsStyle>("summary");

  if (!event) {
    return (
      <Screen>
        <TopBar backHref={`/e/${code}/board`} title="Results" />
        <LoadingState />
      </Screen>
    );
  }

  const live = event;
  const preview = formatResultsText(live, races, style);

  async function downloadCsv() {
    const res = await fetchWithPin(`/api/events/${code}/export`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${live.code}-results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Screen className="max-w-6xl">
      <TopBar
        backHref={`/e/${code}/board`}
        title="Results"
        info="Summary is the short table. Detailed adds every kilometre (~ means estimated), fastest and slowest lap, half splits and consistency. Copy pastes the coach text for the view you have selected."
      />
      <div className="grid grid-cols-2 gap-2 px-3 pb-3 sm:grid-cols-4">
        <Chip size="lg" active={style === "summary"} onClick={() => setStyle("summary")}>
          Summary
        </Chip>
        <Chip size="lg" active={style === "detailed"} onClick={() => setStyle("detailed")}>
          Detailed
        </Chip>
        <BigBtn size="md" className="w-full whitespace-nowrap" onClick={() => void copy("results", preview)}>
          <CopyLabel on={copied === "results"}>Copy</CopyLabel>
        </BigBtn>
        <BigBtn size="md" tone="plain" className="w-full" onClick={() => void downloadCsv()}>
          CSV
        </BigBtn>
      </div>
      <div className="flex-1 overflow-auto px-3 pb-8">
        {races.length === 0 ? (
          <EmptyState title="No results yet" hint="Times land here after the first crossing." />
        ) : (
          <>
            <ResultsTable event={live} races={races} stats={stats} detailed={style === "detailed"} />
          </>
        )}
      </div>
    </Screen>
  );
}

/** Both labels occupy one cell, so "Copied" cannot change the button width. */
function CopyLabel({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span className="inline-grid">
      <span className={`col-start-1 row-start-1 whitespace-nowrap ${on ? "invisible" : ""}`}>{children}</span>
      <span className={`col-start-1 row-start-1 whitespace-nowrap ${on ? "" : "invisible"}`}>Copied</span>
    </span>
  );
}

function ResultsTable({
  event,
  races,
  stats,
  detailed,
}: {
  event: EventState;
  races: RunnerRace[];
  stats: RunnerStats[];
  detailed: boolean;
}) {
  const kmMax = detailed
    ? races.reduce((max, race) => {
        const last = kmMarksFor(event, race).at(-1);
        return Math.max(max, last?.km ?? 0);
      }, 0)
    : 0;

  return (
    <div className="overflow-x-auto">
      <table className={`border-separate border-spacing-0 text-left ${detailed ? "w-max min-w-full" : "w-full"}`}>
        <thead className="text-[11px] font-black uppercase tracking-wider text-dim">
          <tr>
            <Th sticky={detailed ? "rank" : undefined}>#</Th>
            <Th sticky={detailed ? "bib" : undefined}>Bib</Th>
            <Th sticky={detailed ? "name" : undefined}>Name</Th>
            <Th>Cat</Th>
            <Th>Fin</Th>
            <Th>Time</Th>
            <Th>Avg/K</Th>
            {detailed
              ? Array.from({ length: kmMax }, (_, i) => (
                  <Th key={i + 1}>{i + 1}K</Th>
                ))
              : null}
            {detailed ? (
              <>
                <Th>Fast</Th>
                <Th>Slow</Th>
                <Th>1st</Th>
                <Th>2nd</Th>
                <Th>Cons</Th>
              </>
            ) : null}
            <Th>Gap</Th>
          </tr>
        </thead>
        <tbody>
          {races.map((race, i) => (
            <ResultRow
              key={race.runner.id}
              event={event}
              race={race}
              stats={stats[i]}
              place={i + 1}
              kmMax={kmMax}
              detailed={detailed}
              alt={i % 2 === 1}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResultRow({
  event,
  race,
  stats,
  place,
  kmMax,
  detailed,
  alt,
}: {
  event: EventState;
  race: RunnerRace;
  stats: RunnerStats | undefined;
  place: number;
  kmMax: number;
  detailed: boolean;
  alt: boolean;
}) {
  const leader = place === 1;
  const bg = leader ? "bg-[#24140f]" : alt ? "bg-panel" : "bg-void";
  const last = race.crossings.at(-1);
  const total = race.finishMs ?? race.lastElapsed;
  const marks = detailed ? kmMarksFor(event, race) : [];
  const byKm = new Map<number, KmMark>(marks.map((m) => [m.km, m]));
  const laps = detailed ? fullLapsFor(event, race) : [];
  const pair = detailed ? fastestSlowestLap(laps) : null;
  const half = detailed ? halfSplitFor(event, race) : null;
  const cons = detailed ? consistencyPctOf(laps) : null;

  return (
    <tr>
      <Td sticky={detailed ? "rank" : undefined} bg={bg} className={`font-mono text-xs font-black tabular ${leader ? "text-accent" : "text-dim"}`}>
        {place}
      </Td>
      <Td sticky={detailed ? "bib" : undefined} bg={bg} className="font-mono text-base font-black tabular">
        {race.runner.bib}
      </Td>
      <Td sticky={detailed ? "name" : undefined} bg={bg} className="font-bold">
        <span className="flex items-center gap-1.5">
          <span className="max-w-[10rem] truncate">{race.runner.name || "—"}</span>
          {race.runner.dnfAt != null ? (
            <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-stop/15 px-2 text-[11px] font-medium text-stop">
              DNF
            </span>
          ) : null}
          {stats && stats.ignoredSplits > 0 ? (
            <span
              title={`${stats.ignoredSplits} lap${stats.ignoredSplits === 1 ? "" : "s"} under 20s per 400m ignored`}
              className="inline-flex h-5 shrink-0 items-center rounded-full bg-stop/15 px-2 text-[11px] font-medium text-stop"
            >
              Impossible
            </span>
          ) : null}
        </span>
      </Td>
      <Td bg={bg} className="text-xs font-bold uppercase tracking-wide text-accent">
        {race.runner.category}
      </Td>
      <Td bg={bg} className="font-mono font-black tabular">
        {formatLapsShort(lapsCompleted(event, race))}
      </Td>
      <Td bg={bg} className="font-mono font-black tabular">
        {total == null ? "—" : formatEst(formatClubMs(total), last?.estimated)}
      </Td>
      <Td bg={bg} className="font-mono font-black tabular">
        {formatPace(stats?.avgPaceSecPerKm ?? 0)}
      </Td>
      {detailed
        ? Array.from({ length: kmMax }, (_, i) => {
            const mark = byKm.get(i + 1);
            return (
              <Td key={i + 1} bg={bg} className="font-mono text-xs font-bold tabular text-dim">
                {mark ? formatEst(formatClubMs(mark.elapsedMs), !mark.exact) : "—"}
              </Td>
            );
          })
        : null}
      {detailed ? (
        <>
          <Td bg={bg} className="font-mono text-xs font-black tabular">
            {pair && !pair.fast.estimated ? `L${pair.fast.lap} ${formatClubMs(pair.fast.ms)}` : "—"}
          </Td>
          <Td bg={bg} className="font-mono text-xs font-black tabular">
            {pair ? `L${pair.slow.lap} ${formatEst(formatClubMs(pair.slow.ms), pair.slow.estimated)}` : "—"}
          </Td>
          <Td bg={bg} className="font-mono text-xs font-bold tabular">
            {half ? formatClubMs(half.firstMs) : "—"}
          </Td>
          <Td bg={bg} className="font-mono text-xs font-bold tabular">
            {half ? formatClubMs(half.secondMs) : "—"}
          </Td>
          <Td bg={bg} className="font-mono text-xs font-bold tabular">
            {cons == null ? "—" : formatConsistencyPct(cons)}
          </Td>
        </>
      ) : null}
      <Td bg={bg} className="font-mono font-black tabular">
        {stats?.gapToLeaderMs == null ? "—" : formatClock(Math.abs(stats.gapToLeaderMs), 1)}
      </Td>
    </tr>
  );
}

const STICKY = {
  rank: "sticky left-0 z-20 w-10 min-w-10",
  bib: "sticky left-10 z-20 w-14 min-w-14",
  name: "sticky left-24 z-20 min-w-[9rem] shadow-[4px_0_8px_rgba(0,0,0,0.35)]",
} as const;

function Th({
  children,
  sticky,
}: {
  children: React.ReactNode;
  sticky?: keyof typeof STICKY;
}) {
  return (
    <th
      className={`bg-void py-2 pr-2 text-left whitespace-nowrap ${sticky ? STICKY[sticky] : ""}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  bg,
  sticky,
  className = "",
}: {
  children: React.ReactNode;
  bg: string;
  sticky?: keyof typeof STICKY;
  className?: string;
}) {
  return (
    <td className={`border-t border-line py-2 pr-2 whitespace-nowrap ${bg} ${sticky ? STICKY[sticky] : ""} ${className}`}>
      {children}
    </td>
  );
}
