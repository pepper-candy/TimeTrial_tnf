"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/avatar";
import { PaceChart } from "@/components/chart";
import { RaceClock } from "@/components/clock";
import { Chip, HelpTip, Screen, Stat } from "@/components/shell";
import { getBoardTimesMode, setBoardTimesMode, type BoardTimesMode } from "@/lib/client/pin";
import { useEvent } from "@/lib/client/hooks";
import { formatClock, formatPace, formatSpeed } from "@/lib/format";
import { compareRank, type RunnerRace } from "@/lib/race";
import { categoryOrder } from "@/lib/results";
import type { RunnerStats } from "@/lib/stats";
import type { EventState } from "@/lib/types";

export default function BoardPage() {
  const { code } = useParams<{ code: string }>();
  const { event, serverNow, races, stats } = useEvent(code, 1000);
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

  if (!event) {
    return (
      <Screen>
        <div className="p-4 text-dim">…</div>
      </Screen>
    );
  }

  const cats = categoryOrder(event);
  const selected = races.find((r) => r.runner.id === open) ?? null;
  const selectedStats = selected ? stats[races.indexOf(selected)] : null;
  const showId = !event.hideStudentIds;

  function toggleTimes(mode: BoardTimesMode) {
    setTimes(mode);
    setBoardTimesMode(code, mode);
  }

  return (
    <Screen className="max-w-5xl">
      <div className="flex items-start gap-2 px-3 py-2">
        <a
          href={`/e/${code}`}
          className="tap grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-panel2 text-lg font-semibold"
        >
          ←
        </a>
        <RaceClock
          startedAt={event.startedAt}
          now={serverNow}
          className="flex-1 pt-1 text-4xl sm:text-5xl"
        />
        <div className="max-w-[40%] pt-2 text-right">
          <div className="truncate text-sm font-semibold">{event.name}</div>
          <div className="text-xs text-dim">{event.code}</div>
        </div>
        <HelpTip text="Public board — no PIN. Sorted by crossings, then time. Orange = bell. Green = finished. Split = lap duration; Cum = race clock at each crossing." />
      </div>
      <div className="flex flex-wrap gap-2 px-3 pb-2">
        <span className="rounded-full bg-gold px-3.5 py-2 text-sm font-semibold text-ink">Live</span>
        <Link href={`/e/${code}/stats`} className="tap rounded-full bg-panel2 px-3.5 py-2 text-sm font-semibold">
          Stats
        </Link>
        <Chip active={times === "split"} onClick={() => toggleTimes("split")}>
          Split
        </Chip>
        <Chip active={times === "cumulative"} onClick={() => toggleTimes("cumulative")}>
          Cum
        </Chip>
      </div>
      <div className="flex flex-wrap gap-2 px-3 pb-2">
        <Chip active={cat === "all"} onClick={() => setCat("all")}>
          All
        </Chip>
        {cats.map((c) => (
          <Chip key={c} active={cat === c} onClick={() => setCat(c)}>
            {c}
          </Chip>
        ))}
      </div>
      <div className="flex-1 space-y-1.5 overflow-auto px-3 pb-6">
        {shown.map((r, i) => (
          <Row
            key={r.runner.id}
            place={i + 1}
            race={r}
            stats={stats[races.findIndex((x) => x.runner.id === r.runner.id)]}
            event={event}
            times={times}
            showId={showId}
            onOpen={() => setOpen(r.runner.id)}
          />
        ))}
      </div>
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
  onOpen,
}: {
  place: number;
  race: RunnerRace;
  stats: RunnerStats;
  event: EventState;
  times: BoardTimesMode;
  showId: boolean;
  onOpen: () => void;
}) {
  const r = race.runner;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`tap w-full rounded-2xl px-2 py-2 text-left ${
        race.finished
          ? "bg-go/15 ring-1 ring-go/40"
          : race.bell
            ? "bg-bell/20 ring-1 ring-bell"
            : "bg-panel"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="w-5 text-center font-mono text-xs text-dim">{place}</span>
        <Avatar runner={r} eventId={event.id} size={48} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate font-semibold">{r.name || "—"}</span>
            {showId ? <span className="font-mono text-xs text-dim">{r.studentId}</span> : null}
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gold">
              {r.category}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            {race.finished ? (
              <span className="text-xs font-bold text-go">
                FIN {race.finishMs != null ? formatClock(race.finishMs, 2) : ""}
              </span>
            ) : race.lapDown > 0 ? (
              <span className="text-xs font-bold text-stop">−{race.lapDown} lap</span>
            ) : race.bell ? (
              <span className="text-xs font-bold text-bell">BELL</span>
            ) : (
              <span className="text-xs text-dim">{race.crossings.length}/{event.course.requiredCrossings}</span>
            )}
            <span className="font-mono text-xs text-gold">
              {formatPace(stats.lastLapPaceSecPerKm ?? stats.avgPaceSecPerKm ?? 0)}
            </span>
          </div>
        </div>
        <div className="font-mono text-3xl font-black leading-none">{r.bib}</div>
      </div>
      <div className="mt-1 flex gap-1 overflow-x-auto pb-0.5 pl-7">
        {race.splitMs.map((ms, i) => (
            <span
              key={i}
              className="shrink-0 rounded-md bg-black/30 px-1.5 py-0.5 font-mono text-[11px] tabular"
            >
              {formatClock(
                times === "cumulative"
                  ? (race.crossings[i]?.elapsedMs ?? ms)
                  : ms,
                1,
              )}
            </span>
        ))}
      </div>
    </button>
  );
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
    <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="max-h-[88dvh] w-full overflow-auto rounded-t-3xl bg-panel p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <Avatar runner={r} eventId={event.id} size={64} />
          <div className="min-w-0 flex-1">
            <div className="text-xl font-bold">{r.name}</div>
            <div className="font-mono text-sm text-dim">
              {showId ? r.studentId : r.category}
            </div>
          </div>
          <div className="font-mono text-5xl font-black">{r.bib}</div>
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
              <div key={k.km} className="shrink-0 rounded-xl bg-panel2 px-3 py-2">
                <div className="text-[11px] font-semibold text-dim">{k.km}k</div>
                <div className="font-mono text-sm">{formatClock(k.elapsedMs, 1)}</div>
                <div className="font-mono text-xs text-gold">{formatPace(k.paceSecPerKm)}</div>
              </div>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          className="tap mt-5 h-12 w-full rounded-2xl bg-panel2 font-semibold"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}
