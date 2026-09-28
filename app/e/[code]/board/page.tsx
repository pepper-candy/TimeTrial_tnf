"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { PaceChart } from "@/components/chart";
import { RaceClock } from "@/components/clock";
import { Chip, HelpTip, Screen, Stat } from "@/components/shell";
import { EmptyState, LoadingState } from "@/components/states";
import { getBoardTimesMode, setBoardTimesMode, type BoardTimesMode } from "@/lib/client/pin";
import { useFlip } from "@/lib/client/flip";
import { useEvent } from "@/lib/client/hooks";
import { formatClock, formatEst, formatPace, formatSpeed } from "@/lib/format";
import { compareRank, splitEstimated, type RunnerRace } from "@/lib/race";
import { categoryOrder } from "@/lib/results";
import type { RunnerStats } from "@/lib/stats";
import type { EventState } from "@/lib/types";

export default function BoardPage() {
  const { code } = useParams<{ code: string }>();
  const { event, serverNow, races, stats, flags } = useEvent(code, 1000);
  const [open, setOpen] = useState<string | null>(null);
  const [times, setTimes] = useState<BoardTimesMode>("split");
  const [cat, setCat] = useState<string>("all");

  useEffect(() => {
    const id = window.setTimeout(() => setTimes(getBoardTimesMode(code)), 0);
    return () => window.clearTimeout(id);
  }, [code]);

  const shown = useMemo(() => {
    if (cat === "all") return races;
    return races.filter((r) => r.runner.category === cat).slice().sort(compareRank);
  }, [races, cat]);

  const ids = useMemo(() => shown.map((r) => r.runner.id), [shown]);
  const bind = useFlip(ids);

  if (!event) {
    return (
      <Screen className="max-w-5xl">
        <LoadingState />
      </Screen>
    );
  }

  const cats = categoryOrder(event);
  const selected = races.find((r) => r.runner.id === open) ?? null;
  const selectedStats = selected ? stats[races.indexOf(selected)] : null;
  const showId = !event.hideStudentIds;
  const idle = event.status === "setup" || shown.every((r) => r.crossings.length === 0);

  function toggleTimes(mode: BoardTimesMode) {
    setTimes(mode);
    setBoardTimesMode(code, mode);
  }

  return (
    <Screen className="max-w-5xl">
      <div className="flex items-start gap-2 px-3 py-2">
        <a
          href={`/e/${code}`}
          className="tap grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-panel2 text-lg font-semibold ring-1 ring-line"
        >
          ←
        </a>
        <RaceClock
          startedAt={event.startedAt}
          now={serverNow}
          className="flex-1 pt-1 text-4xl sm:text-6xl"
        />
        <div className="max-w-[40%] pt-2 text-right">
          <div className="truncate text-sm font-bold">{event.name}</div>
          <div className="font-mono text-xs tabular text-dim">{event.code}</div>
        </div>
        <HelpTip text="Public board — no PIN. Sorted by crossings, then time. Gold = leader. Orange = bell. Green = finished. Split = lap duration; Cum = race clock." />
      </div>
      <div className="lane-stripe mx-3 mb-3 rounded-full" />
      <div className="flex flex-wrap items-center gap-2 px-3 pb-2">
        <span className="inline-flex items-center gap-2 rounded-full bg-panel2 px-3.5 py-2 text-sm font-bold ring-1 ring-line">
          <span className="live-dot" />
          Live
          {flags.length > 0 ? (
            <span className="h-2 w-2 rounded-full bg-bell" aria-label="Timing check" />
          ) : null}
        </span>
        <Link href={`/e/${code}/stats`} className="tap rounded-full bg-panel2 px-3.5 py-2 text-sm font-semibold ring-1 ring-line">
          Stats
        </Link>
        <Chip active={times === "split"} onClick={() => toggleTimes("split")}>
          Split
        </Chip>
        <Chip active={times === "cumulative"} onClick={() => toggleTimes("cumulative")}>
          Cum
        </Chip>
      </div>
      <div className="flex flex-wrap gap-2 px-3 pb-3">
        <Chip active={cat === "all"} onClick={() => setCat("all")}>
          All
        </Chip>
        {cats.map((c) => (
          <Chip key={c} active={cat === c} onClick={() => setCat(c)}>
            {c}
          </Chip>
        ))}
      </div>
      {idle ? (
        <EmptyState
          title={event.status === "setup" ? "Waiting for start" : "No crossings yet"}
          hint="Leaderboard fills as athletes hit the line."
        />
      ) : (
        <div className="flex-1 space-y-2 overflow-auto px-3 pb-6">
          {shown.map((r, i) => (
            <div key={r.runner.id} ref={bind(r.runner.id)}>
              <Row
                place={i + 1}
                race={r}
                stats={stats[races.findIndex((x) => x.runner.id === r.runner.id)]}
                event={event}
                times={times}
                showId={showId}
                leader={i === 0}
                onOpen={() => setOpen(r.runner.id)}
              />
            </div>
          ))}
        </div>
      )}
      {selected && selectedStats ? (
        <Detail
          event={event}
          race={selected}
          stats={selectedStats}
          showId={showId}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </Screen>
  );
}

function Row({
  place,
  race,
  stats,
  event,
  times,
  showId,
  leader,
  onOpen,
}: {
  place: number;
  race: RunnerRace;
  stats: RunnerStats;
  event: EventState;
  times: BoardTimesMode;
  showId: boolean;
  leader: boolean;
  onOpen: () => void;
}) {
  const r = race.runner;
  const pulse = useCrossingPulse(race.crossings.length);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`tap w-full rounded-2xl px-2 py-2 text-left ring-1 ${
        race.finished
          ? "bg-go/15 ring-go/50"
          : race.bell
            ? "bg-bell/20 ring-bell"
            : leader
              ? "p1-row ring-gold/40"
              : "bg-panel ring-line"
      } ${pulse ? "pulse-cross" : ""}`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`w-6 text-center font-mono text-xs font-black tabular ${
            leader ? "text-gold" : "text-dim"
          }`}
        >
          {place}
        </span>
        <Avatar runner={r} eventId={event.id} size={52} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate font-bold">{r.name || "—"}</span>
            {showId ? <span className="font-mono text-xs tabular text-dim">{r.studentId}</span> : null}
            <span className="text-[11px] font-bold uppercase tracking-wide text-gold">
              {r.category}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            {race.finished ? (
              <span className="font-mono text-xs font-black tabular text-go">
                FIN {race.finishMs != null ? formatEst(formatClock(race.finishMs, 2), race.crossings.at(-1)?.estimated) : ""}
              </span>
            ) : race.lapDown > 0 ? (
              <span className="text-xs font-black text-stop">−{race.lapDown} lap</span>
            ) : race.bell ? (
              <span className="text-xs font-black tracking-wide text-bell">BELL</span>
            ) : (
              <span className="font-mono text-xs tabular text-dim">
                {race.crossings.length}/{event.course.requiredCrossings}
              </span>
            )}
            <span className="font-mono text-xs font-bold tabular text-gold">
              {formatPace(stats.lastLapPaceSecPerKm ?? stats.avgPaceSecPerKm ?? 0)}
            </span>
          </div>
        </div>
        <div className={`font-mono text-3xl font-black leading-none tabular ${leader ? "text-gold" : ""}`}>
          {r.bib}
        </div>
      </div>
      <div className="mt-1 flex gap-1 overflow-x-auto pb-0.5 pl-8">
        {race.splitMs.map((ms, i) => (
          <span
            key={i}
            className={`shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-black tabular ${
              i === race.splitMs.length - 1 ? "bg-gold text-ink" : "bg-black/40"
            }`}
          >
            {formatEst(
              formatClock(
                times === "cumulative" ? (race.crossings[i]?.elapsedMs ?? ms) : ms,
                1,
              ),
              times === "cumulative"
                ? race.crossings[i]?.estimated
                : splitEstimated(race.crossings, i),
            )}
          </span>
        ))}
      </div>
    </button>
  );
}

function useCrossingPulse(count: number) {
  const prev = useRef(count);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (count > prev.current) {
      setOn(true);
      const t = window.setTimeout(() => setOn(false), 650);
      prev.current = count;
      return () => window.clearTimeout(t);
    }
    prev.current = count;
  }, [count]);
  return on;
}

function Detail({
  event,
  race,
  stats,
  showId,
  onClose,
}: {
  event: EventState;
  race: RunnerRace;
  stats: RunnerStats;
  showId: boolean;
  onClose: () => void;
}) {
  const r = race.runner;
  const vs =
    stats.vsTargetSecPerKm == null
      ? null
      : stats.vsTargetSecPerKm >= 0
        ? `+${formatPace(stats.vsTargetSecPerKm)}`
        : `−${formatPace(Math.abs(stats.vsTargetSecPerKm))}`;
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/70" onClick={onClose}>
      <div
        className="max-h-[88dvh] w-full overflow-auto rounded-t-3xl bg-panel p-4 ring-1 ring-line"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <Avatar runner={r} eventId={event.id} size={72} />
          <div className="min-w-0 flex-1">
            <div className="text-xl font-black">{r.name}</div>
            <div className="font-mono text-sm tabular text-dim">
              {showId ? r.studentId : r.category}
            </div>
          </div>
          <div className="font-mono text-5xl font-black tabular">{r.bib}</div>
        </div>
        <div className="mt-4">
          <PaceChart event={event} race={race} />
        </div>
        <div className="mt-5 grid grid-cols-3 gap-4">
          <Stat value={formatPace(stats.avgPaceSecPerKm ?? 0)} label="Avg pace" />
          <Stat value={formatPace(stats.lastLapPaceSecPerKm ?? 0)} label="Last lap" />
          <Stat value={formatPace(stats.fastestLapPaceSecPerKm ?? 0)} label="Best lap" />
          <Stat value={formatPace(stats.slowestLapPaceSecPerKm ?? 0)} label="Slow lap" />
          <Stat
            value={stats.consistencyPct == null ? "—" : `${stats.consistencyPct.toFixed(0)}%`}
            label="Consistency"
          />
          <Stat value={formatSpeed(stats.speedKmh ?? 0)} label="km/h" />
          <Stat
            value={stats.projectedFinishMs == null ? "—" : formatClock(stats.projectedFinishMs, 1)}
            label="Project"
          />
          <Stat
            value={
              stats.gapToLeaderMs == null
                ? "—"
                : (stats.gapToLeaderMs >= 0 ? "+" : "") + formatClock(Math.abs(stats.gapToLeaderMs), 1)
            }
            label="Gap"
          />
          <Stat value={vs ?? "—"} label="vs target" warn={!!stats.vsTargetSecPerKm && stats.vsTargetSecPerKm > 0} />
        </div>
        {stats.kmSplits.length > 0 ? (
          <div className="mt-5 flex gap-2 overflow-x-auto">
            {stats.kmSplits.map((k) => (
              <div key={k.km} className="shrink-0 rounded-xl bg-panel2 px-3 py-2 ring-1 ring-line">
                <div className="text-[11px] font-bold text-dim">{k.km}k</div>
                <div className="font-mono text-sm font-black tabular">{formatClock(k.elapsedMs, 1)}</div>
                <div className="font-mono text-xs font-bold tabular text-gold">{formatPace(k.paceSecPerKm)}</div>
              </div>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          className="tap mt-5 h-14 w-full rounded-2xl bg-panel2 font-bold ring-1 ring-line"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}
