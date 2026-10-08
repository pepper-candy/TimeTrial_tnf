"use client";

import { useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { SwipeRow } from "@/components/swipe-row";
import { formatClock, formatEst } from "@/lib/format";
import { splitEstimated, type Crossing, type RunnerRace } from "@/lib/race";
import { RECORD_TAG_LABEL, recordRowTags, recordRows, type RecordTag } from "@/lib/records";
import type { EventState } from "@/lib/types";

const TAG_CLASS: Record<RecordTag, string> = {
  "too-fast": "bg-stop/15 text-stop",
  duplicate: "bg-accent/15 text-accent",
  "too-slow": "bg-bell/15 text-bell",
  "unknown-bib": "bg-bell/15 text-bell",
  "no-tap": "bg-stop/15 text-stop",
  "no-bib": "bg-stop/15 text-stop",
  edited: "bg-sky/15 text-sky",
};

const MOVE =
  "tap h-14 w-full rounded-xl bg-panel text-[13px] font-black ring-1 ring-line disabled:text-dim/30";

export function CrossingEditor({
  event,
  race,
  onClose,
  onEdit,
  onDnf,
}: {
  event: EventState;
  race: RunnerRace;
  onClose: () => void;
  onEdit: (body: Record<string, unknown>) => Promise<void>;
  onDnf: (dnf: boolean) => Promise<void>;
}) {
  const r = event.runners.find((x) => x.id === race.runner.id) ?? race.runner;
  const [gone, setGone] = useState<{ slot: number; tapId?: string; markId?: string } | null>(null);
  const tagLists = recordRowTags(event, recordRows(event));

  async function del(slot: number, index: number, tapId?: string, markId?: string) {
    await onEdit({ action: "pair-delete", index, actor: "admin" });
    setGone({ slot, tapId, markId });
  }

  async function undo() {
    if (!gone) return;
    await onEdit({
      action: "restore-last",
      actor: "admin",
      tapId: gone.tapId,
      markId: gone.markId,
    });
    setGone(null);
  }

  type Row =
    | { kind: "cross"; crossing: Crossing; lap: number }
    | { kind: "gone" };
  const rows: Row[] = race.crossings.map((crossing, lap) => ({ kind: "cross", crossing, lap }));
  if (gone) rows.splice(Math.min(gone.slot, rows.length), 0, { kind: "gone" });

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/70" onClick={onClose}>
      <div
        className="max-h-[88dvh] w-full overflow-auto rounded-t-3xl bg-panel p-4 ring-1 ring-line"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <Avatar runner={r} eventId={event.id} size={56} lightbox />
          <div className="min-w-0 flex-1">
            <div className="text-lg font-black">{r.name || "—"}</div>
            <div className="font-mono text-sm font-black tabular text-accent">{r.bib}</div>
          </div>
          <button
            type="button"
            aria-pressed={r.dnfAt != null}
            aria-label={r.dnfAt != null ? "Clear DNF" : "Mark DNF"}
            className={`tap h-12 shrink-0 rounded-xl px-4 text-sm font-black ring-1 ${
              r.dnfAt != null ? "bg-stop text-white ring-stop" : "bg-panel2 text-sand ring-line"
            }`}
            onClick={() => void onDnf(r.dnfAt == null)}
          >
            DNF
          </button>
        </div>
        <div className="mt-4 space-y-2">
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-dim">No crossings</p>
          ) : (
            rows.map((row) =>
              row.kind === "gone" ? (
                <button
                  key="deleted"
                  type="button"
                  className="tap flex h-12 w-full items-center justify-center rounded-xl bg-panel2 text-sm font-black ring-1 ring-line"
                  onClick={() => void undo()}
                >
                  <span className="text-dim">Deleted</span>
                  <span className="px-1.5 text-dim">·</span>
                  <span className="text-accent">Undo</span>
                </button>
              ) : (
                <CrossingRow
                  key={row.crossing.tapId}
                  crossing={row.crossing}
                  lap={row.lap + 1}
                  splitMs={race.splitMs[row.lap]}
                  estSplit={splitEstimated(race.crossings, row.lap)}
                  tags={tagLists[row.crossing.index] ?? []}
                  onCommit={(bib) =>
                    onEdit({
                      action: "reassign",
                      index: row.crossing.index,
                      bib,
                      actor: "admin",
                    })
                  }
                  onInsertAbove={() =>
                    void onEdit({
                      action: "pair-insert-at",
                      tapId: row.crossing.tapId,
                      bib: r.bib,
                      where: "above",
                      actor: "admin",
                    })
                  }
                  onInsertBelow={() =>
                    void onEdit({
                      action: "pair-insert-at",
                      tapId: row.crossing.tapId,
                      bib: r.bib,
                      where: "below",
                      actor: "admin",
                    })
                  }
                  onDelete={() =>
                    void del(row.lap, row.crossing.index, row.crossing.tapId, row.crossing.markId)
                  }
                />
              ),
            )
          )}
        </div>
        <button
          type="button"
          className="tap mt-3 h-12 w-full rounded-xl bg-panel2 text-sm font-black ring-1 ring-line"
          onClick={() =>
            void onEdit({ action: "pair-insert-estimated", bib: r.bib, actor: "admin" })
          }
        >
          Insert crossing
        </button>
        <button
          type="button"
          className="tap mt-2 h-14 w-full rounded-2xl bg-panel2 font-bold ring-1 ring-line"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}

function CrossingRow({
  crossing,
  lap,
  splitMs,
  estSplit,
  tags,
  onCommit,
  onInsertAbove,
  onInsertBelow,
  onDelete,
}: {
  crossing: Crossing;
  lap: number;
  splitMs: number | undefined;
  estSplit: boolean;
  tags: RecordTag[];
  onCommit: (bib: string) => Promise<void>;
  onInsertAbove: () => void;
  onInsertBelow: () => void;
  onDelete: () => void;
}) {
  return (
    <SwipeRow
      label="Delete crossing"
      onDelete={onDelete}
      className="rounded-2xl bg-panel2 ring-1 ring-line"
    >
      <div className="p-3">
        <div className="flex items-start gap-2">
          <span className="flex h-12 w-6 shrink-0 items-center font-mono text-xs font-black tabular text-dim">
            {lap}
          </span>
          <div className="flex h-12 min-w-0 flex-1 flex-col justify-center">
            <div className="truncate font-mono text-2xl font-black leading-none tabular">
              {formatEst(formatClock(crossing.elapsedMs), crossing.estimated)}
            </div>
            {splitMs != null ? (
              <div className="mt-1 truncate font-mono text-xs font-bold leading-none tabular text-accent">
                {formatEst(formatClock(splitMs, 1), estSplit)}
              </div>
            ) : null}
          </div>
          <BibBox bib={crossing.bib} onCommit={onCommit} />
        </div>
        <div className="mt-1.5 flex h-5 items-center gap-1 overflow-hidden">
          {tags.map((tag) => (
            <span
              key={tag}
              className={`inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-medium whitespace-nowrap ${TAG_CLASS[tag]}`}
            >
              {RECORD_TAG_LABEL[tag]}
            </span>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button type="button" className={MOVE} onClick={onInsertAbove} aria-label="Insert above">
            ↑ Insert above
          </button>
          <button type="button" className={MOVE} onClick={onInsertBelow} aria-label="Insert below">
            ↓ Insert below
          </button>
        </div>
      </div>
    </SwipeRow>
  );
}

function BibBox({ bib, onCommit }: { bib: string; onCommit: (next: string) => Promise<void> }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [ack, setAck] = useState<string | null>(null);
  const busy = useRef(false);
  const value = draft ?? bib;
  const saved = ack != null && ack === value;

  async function commit() {
    if (busy.current) return;
    const next = value.trim();
    if (!next || next === bib) {
      setDraft(null);
      return;
    }
    busy.current = true;
    setAck(next);
    try {
      await onCommit(next);
      setDraft(null);
    } catch {
      setAck(null);
    } finally {
      busy.current = false;
    }
  }

  return (
    <div className="w-[4.5rem] shrink-0">
      <input
        value={value}
        placeholder="Bib"
        aria-label="Bib"
        inputMode="numeric"
        onChange={(e) => {
          setDraft(e.target.value);
          setAck(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        onBlur={() => void commit()}
        className="h-12 w-full rounded-xl bg-panel px-1 text-center font-mono text-lg font-black tabular text-sand ring-1 ring-line"
      />
      <div className="h-4 text-center text-[10px] font-black leading-4 text-go" aria-live="polite">
        {saved ? "Saved" : ""}
      </div>
    </div>
  );
}
