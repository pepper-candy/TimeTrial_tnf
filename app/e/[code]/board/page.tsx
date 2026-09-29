"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { PaceChart } from "@/components/chart";
import { RaceClock } from "@/components/clock";
import { BigBtn, Chip, MenuButton, Sheet, Stat, TopBar, useCopied } from "@/components/shell";
import { EmptyState, LoadingState } from "@/components/states";
import {
  boardHighlights,
  boardRows,
  formatCum,
  formatLapSplit,
  lapColumns,
  lapDownLabel,
  type BoardFilter,
  type BoardHighlights,
  type LapColumn,
} from "@/lib/board";
import { CATEGORIES, normalizeCategory } from "@/lib/category";
import { useFlip } from "@/lib/client/flip";
import { fetchWithPin, hasHelperCreds, json, useEvent } from "@/lib/client/hooks";
import { getBoardTimesMode, setBoardTimesMode, type BoardTimesMode } from "@/lib/client/pin";
import { formatClock, formatEst, formatPace, formatSpeed, bibColor, initials } from "@/lib/format";
import { photoPath } from "@/lib/photo";
import { splitEstimated, type RunnerRace } from "@/lib/race";
import { formatResultsText } from "@/lib/results";
import { textFits } from "@/lib/text-fit";
import type { RunnerStats } from "@/lib/stats";
import type { EventState } from "@/lib/types";

const INFO =
  "Live board — no PIN. Each box: small = lap split, big = running time. Orange cell = fastest lap of the race. Blue border = runner's best lap. ~ = estimated time. Yellow box = bell lap. Tap a runner for details.";

export default function BoardPage() {
  const { code } = useParams<{ code: string }>();
  const { event, setEvent, serverNow, races, stats } = useEvent(code, 1000);
  const [filter, setFilter] = useState<BoardFilter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [big, setBig] = useState<BoardTimesMode>("cumulative");
  const [helper, setHelper] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const touched = useRef(0);
  const lastN = useRef(-1);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setBig(getBoardTimesMode(code));
      setHelper(hasHelperCreds(code));
    }, 0);
    return () => window.clearTimeout(id);
  }, [code]);

  const rows = useMemo(() => boardRows(races, filter), [races, filter]);
  const ids = useMemo(() => rows.map((r) => r.runner.id), [rows]);
  const bind = useFlip(ids, 420);
  const highlights = useMemo(() => (event ? boardHighlights(event, races) : null), [event, races]);
  const cols = useMemo(() => (event ? lapColumns(event.course) : []), [event]);
  const statsById = useMemo(() => {
    const m = new Map<string, RunnerStats>();
    races.forEach((r, i) => m.set(r.runner.id, stats[i]));
    return m;
  }, [races, stats]);

  const leaderN = rows[0]?.crossings.length ?? 0;
  useEffect(() => {
    const el = scroller.current;
    if (!el || cols.length === 0) return;
    function align(behavior: ScrollBehavior) {
      if (!el || Date.now() - touched.current < 8000) return;
      const col = el.querySelector<HTMLElement>(`[data-col="${Math.min(leaderN, cols.length - 1)}"]`);
      const name = el.querySelector<HTMLElement>("[data-name-head]");
      const tot = el.querySelector<HTMLElement>("[data-tot-head]");
      if (!col || !name || !tot) return;
      const left = col.offsetLeft;
      const right = left + col.offsetWidth;
      const viewL = el.scrollLeft + name.offsetWidth;
      const viewR = el.scrollLeft + el.clientWidth - tot.offsetWidth;
      if (right > viewR) {
        el.scrollTo({ left: right - (el.clientWidth - tot.offsetWidth) + 8, behavior });
      } else if (left < viewL) {
        el.scrollTo({ left: Math.max(0, left - name.offsetWidth - 8), behavior });
      }
    }
    align(Math.abs(leaderN - lastN.current) === 1 ? "smooth" : "auto");
    lastN.current = leaderN;
    const ro = new ResizeObserver(() => align("auto"));
    ro.observe(el);
    return () => ro.disconnect();
  }, [leaderN, cols.length]);

  if (!event || !highlights) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  const hasCats = event.runners.some((r) => normalizeCategory(r.category));
  const running = event.status === "running" && event.startedAt != null;
  const selected = races.find((r) => r.runner.id === open) ?? null;
  const showId = !event.hideStudentIds;

  function pickBig(mode: BoardTimesMode) {
    setBig(mode);
    setBoardTimesMode(code, mode);
  }

  return (
    <div className="flex h-dvh flex-col bg-sbdeep">
      <TopBar
        backHref={`/e/${code}`}
        className="bg-sbdeep/95"
        title={
          hasCats ? (
            <div className="flex gap-1.5">
              <Chip size="sm" active={filter === "all"} onClick={() => setFilter("all")}>
                All
              </Chip>
              {CATEGORIES.map((c) => (
                <Chip key={c} size="sm" active={filter === c} onClick={() => setFilter(c)}>
                  {c}
                </Chip>
              ))}
            </div>
          ) : (
            <h1 className="truncate text-base font-black uppercase tracking-[0.16em]">{event.name}</h1>
          )
        }
        menu={
          <MenuButton title="Board">
            {(close) => (
              <BoardMenu
                code={code}
                event={event}
                races={races}
                big={big}
                helper={helper}
                onBig={pickBig}
                onEvent={setEvent}
                onClose={close}
              />
            )}
          </MenuButton>
        }
        info={INFO}
      />

      {event.runners.length === 0 ? (
        <EmptyState title="No runners yet" hint="Add runners in Admin." />
      ) : (
        <div
          ref={scroller}
          className="sb min-h-0 flex-1 overflow-auto overscroll-contain"
          style={{ "--rows": Math.max(1, rows.length) } as React.CSSProperties}
          onPointerDown={() => {
            touched.current = Date.now();
          }}
          onWheel={() => {
            touched.current = Date.now();
          }}
        >
          <HeaderRow cols={cols} nowCol={running ? leaderN : -1} />
          {rows.map((r, i) => (
            <div key={r.runner.id} ref={bind(r.runner.id)} className="relative">
              <BoardRow
                race={r}
                rank={i + 1}
                odd={i % 2 === 1}
                cols={cols}
                event={event}
                highlights={highlights}
                big={big}
                now={serverNow}
                running={running}
                showId={showId}
                stats={statsById.get(r.runner.id)}
                onOpen={() => setOpen(r.runner.id)}
              />
            </div>
          ))}
        </div>
      )}

      <Footer event={event} leader={rows[0] ?? null} now={serverNow} />

      {selected ? (
        <Detail
          event={event}
          race={selected}
          stats={statsById.get(selected.runner.id)}
          rank={rows.findIndex((r) => r.runner.id === selected.runner.id) + 1}
          showId={showId}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </div>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh flex-col bg-sbdeep">{children}</div>;
}

function HeaderRow({ cols, nowCol }: { cols: LapColumn[]; nowCol: number }) {
  return (
    <div className="sb-head font-mono font-black tabular text-white">
      <div data-name-head className="sb-name flex items-center px-1 text-[10px] uppercase tracking-normal text-white/80 sm:px-3 sm:text-xs sm:tracking-[0.2em]">
        <span className="truncate">Runner</span>
      </div>
      {cols.map((c, i) => (
        <div
          key={c.n}
          data-col={i}
          className={`sb-cell flex flex-col items-center justify-center leading-none ${i === nowCol ? "sb-now" : ""}`}
        >
          <span className="text-lg sm:text-xl lg:text-2xl">{c.n}</span>
          {c.km ? <span className="mt-0.5 text-[10px] tracking-wider text-white/75">{c.km}K</span> : null}
        </div>
      ))}
      <div data-tot-head className="sb-tot flex items-center justify-end px-3 text-lg sm:text-xl lg:text-2xl">
        Total
      </div>
    </div>
  );
}

function BoardRow({
  race,
  rank,
  odd,
  cols,
  event,
  highlights,
  big,
  now,
  running,
  showId,
  stats,
  onOpen,
}: {
  race: RunnerRace;
  rank: number;
  odd: boolean;
  cols: LapColumn[];
  event: EventState;
  highlights: BoardHighlights;
  big: BoardTimesMode;
  now: number;
  running: boolean;
  showId: boolean;
  stats?: RunnerStats;
  onOpen: () => void;
}) {
  const r = race.runner;
  const fresh = useFresh(race.crossings.length);
  const tone = [
    odd ? "sb-odd" : "",
    rank === 1 && race.crossings.length > 0 ? "sb-leader" : "",
    race.finished ? "sb-fin" : "",
    race.bell ? "sb-belling" : "",
  ].join(" ");
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className={`sb-row tap ${tone}`}
    >
      <div className="sb-name flex items-center px-1 sm:gap-2 sm:px-2">
        <span className={`sb-rank font-mono tabular ${rank === 1 && race.crossings.length > 0 ? "sb-lead" : ""}`}>
          {rank}
        </span>
        <Thumb race={race} eventId={event.id} />
        <div className="hidden min-w-0 flex-1 items-center gap-2 sm:flex" title={r.name || undefined}>
          <div className="sb-bib shrink-0 font-mono font-black leading-none tabular sm:min-w-[2ch] sm:text-right">
            {r.bib}
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-bold text-sand lg:text-base">{r.name || "—"}</div>
            {showId && r.studentId ? (
              <div className="hidden truncate font-mono text-xs tabular text-dim lg:block">{r.studentId}</div>
            ) : null}
          </div>
        </div>
        <PhoneName name={r.name} />
      </div>
      {cols.map((c, i) => (
        <LapCell
          key={c.n}
          index={i}
          race={race}
          event={event}
          highlights={highlights}
          big={big}
          fresh={fresh === i}
          now={now}
          running={running}
        />
      ))}
      <div className="sb-tot flex flex-col items-end justify-center gap-1 px-3">
        <TotalCell race={race} event={event} stats={stats} />
      </div>
    </div>
  );
}

function LapCell({
  index,
  race,
  event,
  highlights,
  big,
  fresh,
  now,
  running,
}: {
  index: number;
  race: RunnerRace;
  event: EventState;
  highlights: BoardHighlights;
  big: BoardTimesMode;
  fresh: boolean;
  now: number;
  running: boolean;
}) {
  const c = race.crossings[index];
  if (!c) {
    const next = running && !race.finished && index === race.crossings.length;
    const bell = next && race.bell;
    const since = race.lastEpoch ?? event.startedAt ?? now;
    return (
      <div className={`sb-cell ${next ? "sb-next" : "sb-empty"} ${bell ? "sb-bell" : ""}`}>
        {bell ? <span className="sb-tag">BELL</span> : null}
        {next ? <span className="sb-live font-mono tabular">{formatLapSplit(Math.max(0, now - since))}</span> : null}
      </div>
    );
  }
  const id = race.runner.id;
  const split = race.splitMs[index] ?? 0;
  const splitEst = splitEstimated(race.crossings, index);
  const best = highlights.raceBest?.runnerId === id && highlights.raceBest.index === index;
  const pb = !best && highlights.personalBest.get(id) === index;
  const splitText = formatEst(formatLapSplit(split), splitEst);
  const cumText = formatEst(formatCum(c.elapsedMs), c.estimated);
  const splitBig = big === "split";
  const mark = best ? "sb-best" : pb ? "sb-pb" : "";
  return (
    <div className={`sb-cell font-mono tabular ${fresh ? "sb-fresh" : ""} ${mark}`}>
      <div className="sb-top">
        <span className="sb-mini">{splitBig ? cumText : splitText}</span>
      </div>
      <div className="sb-big">
        <span>{splitBig ? splitText : cumText}</span>
      </div>
    </div>
  );
}

function TotalCell({ race, event, stats }: { race: RunnerRace; event: EventState; stats?: RunnerStats }) {
  const last = race.crossings.at(-1);
  const ms = race.finished ? race.finishMs : race.lastElapsed;
  const value = ms != null && last ? formatEst(formatClock(ms, 1), last.estimated) : "—";
  const dot = value.lastIndexOf(".");
  let status: React.ReactNode;
  if (race.finished) status = <span className="text-go">FIN</span>;
  else if (race.bell) status = <span className="text-bell">BELL</span>;
  else if (race.lapDown > 0) status = <span className="text-stop">{lapDownLabel(race.lapDown)}</span>;
  else status = <span className="text-dim">{race.crossings.length}/{event.course.requiredCrossings}</span>;
  return (
    <>
      <div className="sb-total font-mono font-black tabular text-white">
        {dot > 0 ? (
          <>
            {value.slice(0, dot)}
            <span className="hidden sm:inline">{value.slice(dot)}</span>
          </>
        ) : (
          value
        )}
      </div>
      <div className="sb-status flex items-baseline gap-2 font-mono font-black tabular">
        {stats?.avgPaceSecPerKm ? (
          <span className="hidden text-dim sm:inline">{formatPace(stats.avgPaceSecPerKm)}/k</span>
        ) : null}
        {status}
      </div>
    </>
  );
}

function Thumb({ race, eventId }: { race: RunnerRace; eventId: string }) {
  const r = race.runner;
  const src = r.photoVer ? photoPath(eventId, r.id, r.photoVer, "thumb") : null;
  return (
    <div className="sb-photo relative shrink-0 overflow-hidden rounded-lg ring-1 ring-black/60">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <div
          className="grid h-full w-full place-items-center text-sm font-black text-white"
          style={{ background: bibColor(r.bib || r.name || "?") }}
        >
          <span className="hidden sm:inline">{initials(r.name) || r.bib.slice(0, 2)}</span>
        </div>
      )}
      <span className="absolute inset-x-0 bottom-0 grid h-[58%] place-items-center bg-gradient-to-t from-black/85 to-black/25 font-mono text-[15px] font-black leading-none tabular tracking-tight text-white [text-shadow:0_1px_2px_#000] sm:hidden">
        {r.bib}
      </span>
    </div>
  );
}

/** Phone only. Shown only when the full name fits; a truncated stub is hidden. */
function PhoneName({ name }: { name: string }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [fits, setFits] = useState(false);

  useEffect(() => {
    const el = anchor.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const label = name || "—";
    const measure = () => {
      if (!window.matchMedia("(max-width: 639px)").matches) {
        setFits(false);
        return;
      }
      const avatar = parent.querySelector(".sb-photo") as HTMLElement | null;
      const cs = getComputedStyle(parent);
      const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const gap = parseFloat(cs.columnGap) || 0;
      const available = parent.clientWidth - pad - (avatar?.offsetWidth ?? 0) - (avatar ? gap : 0);
      setFits(textFits(labelWidth(label), available));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(parent);
    const mq = window.matchMedia("(max-width: 639px)");
    mq.addEventListener("change", measure);
    return () => {
      ro.disconnect();
      mq.removeEventListener("change", measure);
    };
  }, [name]);

  return (
    <span ref={anchor} className="contents">
      {fits ? (
        <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-sand sm:hidden">{name || "—"}</span>
      ) : null}
    </span>
  );
}

function labelWidth(text: string): number {
  const span = document.createElement("span");
  span.className = "text-[11px] font-bold";
  span.style.cssText = "position:fixed;left:-9999px;top:0;white-space:nowrap;visibility:hidden";
  span.textContent = text;
  document.body.appendChild(span);
  const width = span.scrollWidth;
  span.remove();
  return width;
}

function Footer({ event, leader, now }: { event: EventState; leader: RunnerRace | null; now: number }) {
  const laps = event.course.totalDistanceM / event.course.lapLengthM;
  const lapsText = Number.isInteger(laps) ? String(laps) : laps.toFixed(1);
  const lead = leader && leader.crossings.length > 0 ? leader : null;
  return (
    <footer className="sb-foot grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 sm:px-5 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto] md:py-3">
      <div className="min-w-0">
        <div className="truncate text-lg font-black leading-tight sm:text-2xl lg:text-3xl">{event.name}</div>
        <div className="mt-0.5 flex items-center gap-3 font-mono text-sm font-black tabular text-dim sm:text-base lg:text-xl">
          <span className="whitespace-nowrap">{event.course.totalDistanceM} m</span>
          <span className="whitespace-nowrap">{lapsText} laps</span>
          {lead ? (
            <span className="flex min-w-0 items-center gap-1.5 md:hidden">
              <span className="rounded-md bg-accent px-1.5 text-ink">1</span>
              <span className="text-sand">#{lead.runner.bib}</span>
            </span>
          ) : null}
          {event.status === "running" ? <span className="live-dot" aria-label="Live" /> : null}
        </div>
      </div>
      <div className="hidden min-w-0 items-center gap-3 md:flex">
        {lead ? (
          <>
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-accent font-mono text-2xl font-black text-ink lg:h-14 lg:w-14 lg:text-3xl">
              1
            </span>
            <div className="min-w-0">
              <div className="font-mono text-3xl font-black leading-none tabular lg:text-4xl">#{lead.runner.bib}</div>
              <div className="truncate text-sm font-bold text-dim lg:text-base">{lead.runner.name}</div>
            </div>
          </>
        ) : (
          <span className="text-sm font-bold uppercase tracking-[0.2em] text-dim">
            {event.status === "setup" ? "Waiting" : "Leader"}
          </span>
        )}
      </div>
      <RaceClock
        startedAt={event.startedAt}
        now={now}
        className="text-right text-4xl sm:text-5xl lg:text-7xl"
      />
    </footer>
  );
}

function BoardMenu({
  code,
  event,
  races,
  big,
  helper,
  onBig,
  onEvent,
  onClose,
}: {
  code: string;
  event: EventState;
  races: RunnerRace[];
  big: BoardTimesMode;
  helper: boolean;
  onBig: (m: BoardTimesMode) => void;
  onEvent: (e: EventState) => void;
  onClose: () => void;
}) {
  const { copied, copy } = useCopied();

  async function csv() {
    const res = await fetchWithPin(`/api/events/${code}/export`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${event.code}-results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function toggleIds() {
    const data = await json<{ event: EventState }>(`/api/events/${code}`, {
      method: "PATCH",
      body: JSON.stringify({ hideStudentIds: !event.hideStudentIds }),
    });
    onEvent(data.event);
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-dim">Big number</div>
        <div className="flex gap-2">
          <Chip active={big === "cumulative"} onClick={() => onBig("cumulative")}>
            Run time
          </Chip>
          <Chip active={big === "split"} onClick={() => onBig("split")}>
            Lap split
          </Chip>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <BigBtn
          tone="plain"
          size="md"
          onClick={() => {
            void document.documentElement.requestFullscreen?.().catch(() => {});
            onClose();
          }}
        >
          Full screen
        </BigBtn>
        <BigBtn tone="plain" size="md" href={`/e/${code}/stats`}>
          Results
        </BigBtn>
        {helper ? (
          <>
            <BigBtn
              size="md"
              onClick={() => void copy("results", formatResultsText(event, races, "summary"))}
            >
              {copied === "results" ? "Copied" : "Copy results"}
            </BigBtn>
            <BigBtn tone="plain" size="md" onClick={() => void csv()}>
              CSV
            </BigBtn>
          </>
        ) : null}
      </div>
      {helper ? (
        <div className="flex gap-2">
          <Chip active={event.hideStudentIds} onClick={() => void toggleIds()}>
            Hide IDs
          </Chip>
        </div>
      ) : null}
    </div>
  );
}

function useFresh(count: number) {
  const prev = useRef(count);
  const [fresh, setFresh] = useState(-1);
  useEffect(() => {
    if (count <= prev.current) {
      prev.current = count;
      return;
    }
    prev.current = count;
    const on = window.setTimeout(() => setFresh(count - 1), 0);
    const off = window.setTimeout(() => setFresh(-1), 900);
    return () => {
      window.clearTimeout(on);
      window.clearTimeout(off);
    };
  }, [count]);
  return fresh;
}

function Detail({
  event,
  race,
  stats,
  rank,
  showId,
  onClose,
}: {
  event: EventState;
  race: RunnerRace;
  stats?: RunnerStats;
  rank: number;
  showId: boolean;
  onClose: () => void;
}) {
  const r = race.runner;
  const vs =
    stats?.vsTargetSecPerKm == null
      ? null
      : stats.vsTargetSecPerKm >= 0
        ? `+${formatPace(stats.vsTargetSecPerKm)}`
        : `−${formatPace(Math.abs(stats.vsTargetSecPerKm))}`;
  return (
    <Sheet title={rank > 0 ? `Rank ${rank}` : "Runner"} onClose={onClose}>
      <div className="flex items-center gap-3">
        <Avatar runner={r} eventId={event.id} size={72} lightbox />
        <div className="min-w-0 flex-1">
          <div className="text-xl font-black leading-tight break-words">{r.name || "—"}</div>
          <div className="font-mono text-sm tabular text-dim">
            {[showId ? r.studentId : "", normalizeCategory(r.category)].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div className="font-mono text-5xl font-black tabular">{r.bib}</div>
      </div>
      <div className="mt-4">
        <PaceChart event={event} race={race} />
      </div>
      {stats ? (
        <div className="mt-5 grid grid-cols-3 gap-4">
          <Stat value={formatPace(stats.avgPaceSecPerKm ?? 0)} label="Avg /km" />
          <Stat value={formatPace(stats.lastLapPaceSecPerKm ?? 0)} label="Last lap" />
          <Stat value={formatPace(stats.fastestLapPaceSecPerKm ?? 0)} label="Best lap" />
          <Stat
            value={stats.projectedFinishMs == null ? "—" : formatClock(stats.projectedFinishMs, 0).replace(/\.\d$/, "")}
            label="Projected"
          />
          <Stat
            value={
              stats.gapToLeaderMs == null
                ? "—"
                : (stats.gapToLeaderMs > 0 ? "+" : "") + formatLapSplit(Math.abs(stats.gapToLeaderMs))
            }
            label="Gap"
          />
          <Stat value={formatSpeed(stats.speedKmh ?? 0)} label="km/h" />
          {vs ? (
            <Stat value={vs} label="vs target" warn={!!stats.vsTargetSecPerKm && stats.vsTargetSecPerKm > 0} />
          ) : null}
        </div>
      ) : null}
      {stats && stats.kmSplits.length > 0 ? (
        <div className="mt-5 flex gap-2 overflow-x-auto">
          {stats.kmSplits.map((k) => (
            <div key={k.km} className="shrink-0 rounded-xl bg-panel2 px-3 py-2 ring-1 ring-line">
              <div className="text-[11px] font-bold text-dim">{k.km}K</div>
              <div className="font-mono text-lg font-black tabular">{formatCum(k.elapsedMs)}</div>
              <div className="font-mono text-xs font-bold tabular text-accent">{formatPace(k.paceSecPerKm)}</div>
            </div>
          ))}
        </div>
      ) : null}
    </Sheet>
  );
}
