"use client";

import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/avatar";
import { RaceClock } from "@/components/clock";
import { NumberPad } from "@/components/pad";
import { Chip, HelpTip, Screen } from "@/components/shell";
import { PinGate } from "@/components/pin-gate";
import { json, useEvent } from "@/lib/client/hooks";
import { formatClock, shortName } from "@/lib/format";
import { tapElapsed, unmatchedTaps, zipPairs } from "@/lib/race";
import type { EventState } from "@/lib/types";
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
  const { event, setEvent, serverNow, tiles, flags } = useEvent(code, 800);
  const [mode, setMode] = useState<"auto" | "pad" | "tiles">("auto");
  const [bib, setBib] = useState("");
  const [fix, setFix] = useState(false);
  const [reassign, setReassign] = useState<number | null>(null);
  const [insertAt, setInsertAt] = useState<number | null>(null);

  const pending = event ? unmatchedTaps(event.taps, event.marks) : [];
  const hasTiles = tiles.length > 0;
  const showPad =
    mode === "pad" || (mode === "auto" && !hasTiles) || reassign != null || insertAt != null;

  async function mark(nextBib: string) {
    const b = nextBib.trim();
    if (!b) return;
    if (reassign != null) {
      const data = await json<{ event: EventState }>(`/api/events/${code}/marks`, {
        method: "POST",
        body: JSON.stringify({ action: "reassign", index: reassign, bib: b }),
      });
      setEvent(data.event);
      setReassign(null);
      setBib("");
      return;
    }
    if (insertAt != null) {
      const data = await json<{ event: EventState }>(`/api/events/${code}/marks`, {
        method: "POST",
        body: JSON.stringify({ action: "insert", index: insertAt, bib: b }),
      });
      setEvent(data.event);
      setInsertAt(null);
      setBib("");
      return;
    }
    const data = await json<{ event: EventState }>(`/api/events/${code}/marks`, {
      method: "POST",
      body: JSON.stringify({ action: "append", bib: b }),
    });
    setEvent(data.event);
    setBib("");
    try {
      navigator.vibrate?.(12);
    } catch {
      /* ignore */
    }
  }

  if (!event) {
    return (
      <Screen>
        <div className="p-4 text-dim">…</div>
      </Screen>
    );
  }

  return (
    <Screen className="max-w-none">
      <div className="flex items-center gap-2 px-3 py-2">
        <a
          href={`/e/${code}`}
          className="tap grid h-11 w-11 place-items-center rounded-xl bg-panel2 text-lg font-semibold"
        >
          ←
        </a>
        <RaceClock startedAt={event.startedAt} now={serverNow} className="flex-1 text-center text-2xl" />
        <Chip
          active={showPad && reassign == null && insertAt == null}
          onClick={() => setMode((m) => (m === "pad" ? "tiles" : "pad"))}
        >
          {showPad ? "Tiles" : "Pad"}
        </Chip>
        <HelpTip text="Marks pair with timer taps in order. Tiles are next-arrival order. Pad is always one tap away." />
      </div>

      <button
        type="button"
        className="tap mx-3 flex items-center justify-between rounded-xl bg-panel px-3 py-2 text-sm"
        onClick={() => setFix((v) => !v)}
      >
        <span className="font-semibold">
          Taps {event.taps.length} · Marks {event.marks.length}
        </span>
        <span className="font-mono text-gold">
          {pending.length ? pending.slice(0, 4).map((t) => formatClock(tapElapsed(event, t))).join("  ") : "OK"}
        </span>
      </button>
      {flags.length > 0 ? (
        <div className="mx-3 mt-1 text-xs font-semibold text-stop">
          {flags.slice(0, 3).map((f) => (
            <span key={`${f.kind}-${f.index}`} className="mr-2">
              {f.kind === "too-fast" ? "Too fast" : f.kind === "over-count" ? "Over" : "Bib?"} #{f.bib}
            </span>
          ))}
        </div>
      ) : null}

      {fix ? (
        <FixList
          event={event}
          onDelete={async (index) => {
            const data = await json<{ event: EventState }>(`/api/events/${code}/marks`, {
              method: "POST",
              body: JSON.stringify({ action: "delete", index }),
            });
            setEvent(data.event);
          }}
          onSwap={async (index) => {
            const data = await json<{ event: EventState }>(`/api/events/${code}/marks`, {
              method: "POST",
              body: JSON.stringify({ action: "swap", index, j: index + 1 }),
            });
            setEvent(data.event);
          }}
          onReassign={(index) => {
            setReassign(index);
            setInsertAt(null);
            setBib("");
          }}
          onInsert={(index) => {
            setInsertAt(index);
            setReassign(null);
            setBib("");
          }}
        />
      ) : null}

      <div className="flex flex-1 flex-col overflow-hidden p-3 pt-2">
        {showPad ? (
          <div className="flex flex-1 flex-col">
            <div className="mb-2 flex h-16 items-center justify-center rounded-2xl bg-panel font-mono text-5xl font-bold">
              {reassign != null ? `→${bib || "_"}` : insertAt != null ? `+${bib || "_"}` : bib || " "}
            </div>
            <NumberPad value={bib} onChange={setBib} onEnter={() => void mark(bib)} enterLabel="Enter" />
          </div>
        ) : (
          <TileGrid tiles={tiles} eventId={event.id} onPick={(r) => void mark(r.runner.bib)} />
        )}
      </div>
    </Screen>
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
      className={`tap flex w-full flex-col items-center justify-center rounded-2xl bg-panel p-2 active:bg-gold active:text-ink ${
        large ? "min-h-40" : "min-h-28"
      } ${race.bell ? "ring-2 ring-bell" : ""}`}
    >
      <Avatar runner={r} eventId={eventId} size={large ? 64 : 44} />
      <div className="mt-1 font-mono text-3xl font-black leading-none">{r.bib}</div>
      <div className="text-xs font-semibold text-dim">{shortName(r.name)}</div>
    </button>
  );
}

function FixList({
  event,
  onDelete,
  onSwap,
  onReassign,
  onInsert,
}: {
  event: EventState;
  onDelete: (i: number) => void;
  onSwap: (i: number) => void;
  onReassign: (i: number) => void;
  onInsert: (i: number) => void;
}) {
  const pairs = useMemo(() => zipPairs(event.taps, event.marks).slice(-12).reverse(), [event]);
  return (
    <div className="mx-3 mt-2 max-h-48 space-y-1 overflow-auto rounded-xl bg-panel p-2">
      {pairs.map((p) => (
        <div key={p.index} className="flex items-center gap-2 text-sm">
          <span className="w-8 font-mono text-dim">{p.index + 1}</span>
          <span className="w-16 font-mono">
            {p.tap ? formatClock(tapElapsed(event, p.tap)) : "—"}
          </span>
          <span className="w-10 font-mono font-bold">{p.mark?.bib ?? "—"}</span>
          <button type="button" className="tap rounded-lg bg-panel2 px-2 py-1" onClick={() => onReassign(p.index)}>
            Bib
          </button>
          <button type="button" className="tap rounded-lg bg-panel2 px-2 py-1" onClick={() => onInsert(p.index)}>
            Ins
          </button>
          <button type="button" className="tap rounded-lg bg-panel2 px-2 py-1" onClick={() => onSwap(p.index)}>
            Swap
          </button>
          <button type="button" className="tap rounded-lg bg-panel2 px-2 py-1 text-stop" onClick={() => onDelete(p.index)}>
            Del
          </button>
        </div>
      ))}
    </div>
  );
}
