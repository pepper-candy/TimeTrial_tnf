"use client";

import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { RaceClock } from "@/components/clock";
import { NumberPad } from "@/components/pad";
import { Chip, HelpTip, Screen } from "@/components/shell";
import { PinGate } from "@/components/pin-gate";
import { LoadingState } from "@/components/states";
import { UndoToast } from "@/components/undo-toast";
import { json, useEvent } from "@/lib/client/hooks";
import { formatClock, formatEst, shortName } from "@/lib/format";
import { liveMarks, liveTaps, runnerByBib, tapElapsed, unmatchedTaps, zipPairs } from "@/lib/race";
import type { EventState, Runner } from "@/lib/types";
import type { RunnerRace } from "@/lib/race";

export default function MarkerPage() {
  const { code } = useParams<{ code: string }>();
  return (
    <PinGate code={code}>
      <MarkerInner code={code} />
    </PinGate>
  );
}

function MarkerInner({ code }: { code: string }) {
  const { event, setEvent, serverNow, tiles } = useEvent(code, 800);
  const [mode, setMode] = useState<"auto" | "pad" | "tiles">("auto");
  const [bib, setBib] = useState("");
  const [reassign, setReassign] = useState<number | null>(null);
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [toast, setToast] = useState<{ id: string; label: string } | null>(null);

  const pending = event ? unmatchedTaps(event.taps, event.marks) : [];
  const hasTiles = tiles.length > 0;
  const showPad = mode === "pad" || (mode === "auto" && !hasTiles);

  async function post(body: Record<string, unknown>) {
    const data = await json<{ event: EventState }>(`/api/events/${code}/marks`, {
      method: "POST",
      body: JSON.stringify({ ...body, actor: "marker" }),
    });
    setEvent(data.event);
    return data.event;
  }

  async function mark(nextBib: string) {
    const b = nextBib.trim();
    if (!b) return;
    if (reassign != null) {
      await post({ action: "reassign", index: reassign, bib: b });
      setReassign(null);
      setSelected(null);
      setBib("");
      return;
    }
    if (insertAt != null) {
      await post({ action: "insert", index: insertAt, bib: b });
      setInsertAt(null);
      setSelected(null);
      setBib("");
      return;
    }
    await post({ action: "append", bib: b });
    setBib("");
    try {
      navigator.vibrate?.(12);
    } catch {
      /* ignore */
    }
  }

  async function deleteMark(index: number) {
    const mark = event ? liveMarks(event.marks)[index] : undefined;
    await post({ action: "delete", index });
    if (mark) setToast({ id: mark.id, label: "Mark deleted" });
    setSelected(null);
  }

  async function restoreMark(id: string) {
    await post({ action: "mark-restore", id });
    setToast(null);
  }

  async function moveMark(from: number, to: number) {
    if (from === to) return;
    await post({ action: "move", index: from, to });
  }

  if (!event) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  const pairs = zipPairs(event.taps, event.marks);
  const recent = pairs.filter((p) => p.mark).slice(-8);

  return (
    <Screen className="max-w-none">
      <div className="flex items-center gap-2 px-3 py-2">
        <a
          href={`/e/${code}`}
          className="tap grid h-11 w-11 place-items-center rounded-xl bg-panel2 text-lg font-semibold ring-1 ring-line"
        >
          ←
        </a>
        <RaceClock startedAt={event.startedAt} now={serverNow} className="flex-1 text-center text-3xl" />
        <Chip
          active={showPad && reassign == null && insertAt == null}
          onClick={() => setMode((m) => (m === "pad" ? "tiles" : "pad"))}
        >
          {showPad ? "Tiles" : "Pad"}
        </Chip>
        <HelpTip text="Marks pair with taps in order. Tap a recent chip to change bib; drag to reorder; + / del with Undo. Extra taps belong on Timer." />
      </div>

      <div className="mx-3 flex items-center justify-between rounded-xl bg-panel px-3 py-2 text-sm ring-1 ring-line">
        <span className="font-semibold">
          Taps {liveTaps(event.taps).length} · Marks {liveMarks(event.marks).length}
        </span>
        <span className={`font-mono font-black tabular ${pending.length ? "text-stop" : "text-go"}`}>
          {pending.length ? `${pending.length} extra` : "OK"}
        </span>
      </div>

      {recent.length > 0 ? (
        <RecentMarks
          event={event}
          pairs={recent}
          selected={selected}
          onSelect={(i) => {
            setSelected((cur) => (cur === i ? null : i));
            setReassign(null);
            setInsertAt(null);
            setBib("");
          }}
          onMove={(from, to) => void moveMark(from, to)}
        />
      ) : null}

      {selected != null ? (
        <div className="mx-3 mt-2 grid grid-cols-4 gap-2">
          <button
            type="button"
            className="tap h-12 rounded-xl bg-panel2 text-sm font-black ring-1 ring-line"
            onClick={() => {
              setReassign(selected);
              setInsertAt(null);
            }}
          >
            Bib
          </button>
          <button
            type="button"
            className="tap h-12 rounded-xl bg-panel2 text-sm font-black ring-1 ring-line"
            onClick={() => {
              setInsertAt(selected);
              setReassign(null);
            }}
          >
            +‹
          </button>
          <button
            type="button"
            className="tap h-12 rounded-xl bg-panel2 text-sm font-black ring-1 ring-line"
            onClick={() => {
              setInsertAt(selected + 1);
              setReassign(null);
            }}
          >
            +›
          </button>
          <button
            type="button"
            className="tap h-12 rounded-xl bg-stop/20 text-sm font-black text-stop ring-1 ring-stop"
            onClick={() => void deleteMark(selected)}
          >
            Del
          </button>
        </div>
      ) : null}

      <div className="flex flex-1 flex-col overflow-hidden p-3 pt-2">
        {reassign != null || insertAt != null ? (
          <div className="mb-2 rounded-xl bg-gold/15 px-3 py-2 text-center text-sm font-black text-gold ring-1 ring-gold/40">
            {reassign != null ? "Change bib" : "Insert mark"}
          </div>
        ) : null}
        {showPad ? (
          <div className="flex flex-1 flex-col">
            <div className="mb-2 flex h-16 items-center justify-center rounded-2xl bg-panel font-mono text-5xl font-black tabular ring-1 ring-line">
              {reassign != null ? `→${bib || "_"}` : insertAt != null ? `+${bib || "_"}` : bib || " "}
            </div>
            <NumberPad value={bib} onChange={setBib} onEnter={() => void mark(bib)} enterLabel="Enter" />
          </div>
        ) : (
          <TileGrid tiles={tiles} eventId={event.id} onPick={(r) => void mark(r.runner.bib)} />
        )}
      </div>
      {toast ? (
        <UndoToast
          key={toast.id}
          message={toast.label}
          onUndo={() => void restoreMark(toast.id)}
          onGone={() => setToast(null)}
        />
      ) : null}
    </Screen>
  );
}

function RecentMarks({
  event,
  pairs,
  selected,
  onSelect,
  onMove,
}: {
  event: EventState;
  pairs: { index: number; tap: EventState["taps"][number] | null; mark: EventState["marks"][number] | null }[];
  selected: number | null;
  onSelect: (index: number) => void;
  onMove: (from: number, to: number) => void;
}) {
  const drag = useRef<{ from: number; x: number; dragging: boolean } | null>(null);

  return (
    <div className="mx-3 mt-2 flex gap-2 overflow-x-auto pb-1">
      {pairs.map((p) => {
        if (!p.mark) return null;
        const runner: Runner | undefined = runnerByBib(event.runners, p.mark.bib);
        const active = selected === p.index;
        return (
          <button
            key={p.mark.id}
            type="button"
            className={`tap flex h-16 shrink-0 items-center gap-2 rounded-xl px-2 ring-1 ${
              active ? "bg-gold text-ink ring-gold" : "bg-panel ring-line"
            }`}
            onPointerDown={(e) => {
              (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
              drag.current = { from: p.index, x: e.clientX, dragging: false };
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d || d.from !== p.index) return;
              if (Math.abs(e.clientX - d.x) > 14) d.dragging = true;
            }}
            onPointerUp={(e) => {
              const d = drag.current;
              drag.current = null;
              if (!d || d.from !== p.index) return;
              if (d.dragging) {
                const delta = Math.round((e.clientX - d.x) / 88);
                const to = Math.max(0, Math.min(pairs[pairs.length - 1].index, d.from + delta));
                onMove(d.from, to);
                return;
              }
              onSelect(p.index);
            }}
          >
            {runner ? (
              <Avatar runner={runner} eventId={event.id} size={40} overlay={false} />
            ) : (
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-panel2 font-black">
                ?
              </div>
            )}
            <div className="text-left">
              <div className="font-mono text-xl font-black leading-none tabular">{p.mark.bib}</div>
              <div className={`font-mono text-[11px] font-black tabular ${active ? "text-ink/70" : "text-dim"}`}>
                {p.tap
                  ? formatEst(formatClock(tapElapsed(event, p.tap)), p.tap.estimated)
                  : "—"}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function TileGrid({
  tiles,
  eventId,
  onPick,
}: {
  tiles: RunnerRace[];
  eventId: string;
  onPick: (r: RunnerRace) => void;
}) {
  const top = tiles.slice(0, 3);
  const rest = tiles.slice(3);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
      {top[0] ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <Tile race={top[0]} eventId={eventId} large onPick={() => onPick(top[0])} />
          </div>
          {top[1] ? (
            <Tile race={top[1]} eventId={eventId} onPick={() => onPick(top[1])} />
          ) : null}
          {top[2] ? (
            <Tile race={top[2]} eventId={eventId} onPick={() => onPick(top[2])} />
          ) : null}
        </div>
      ) : null}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {rest.map((r) => (
          <Tile key={r.runner.id} race={r} eventId={eventId} onPick={() => onPick(r)} />
        ))}
      </div>
    </div>
  );
}

function Tile({
  race,
  eventId,
  large,
  onPick,
}: {
  race: RunnerRace;
  eventId: string;
  large?: boolean;
  onPick: () => void;
}) {
  const r = race.runner;
  return (
    <button
      type="button"
      onPointerDown={(e) => {
        e.preventDefault();
        onPick();
      }}
      className={`tap flex w-full flex-col items-center justify-center rounded-2xl bg-panel p-2 ring-1 ring-line active:bg-gold active:text-ink ${
        large ? "min-h-40" : "min-h-28"
      } ${race.bell ? "ring-2 ring-bell" : ""}`}
    >
      <Avatar runner={r} eventId={eventId} size={large ? 72 : 52} />
      <div className="mt-1 font-mono text-3xl font-black leading-none tabular">{r.bib}</div>
      <div className="text-xs font-semibold text-dim">{shortName(r.name)}</div>
    </button>
  );
}
