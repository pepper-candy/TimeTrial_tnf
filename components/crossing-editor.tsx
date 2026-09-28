"use client";

import { useState } from "react";
import { Avatar } from "@/components/avatar";
import { Field } from "@/components/shell";
import { UndoToast } from "@/components/undo-toast";
import { formatClock, formatEst } from "@/lib/format";
import { splitEstimated, type RunnerRace } from "@/lib/race";
import type { EventState } from "@/lib/types";

export function CrossingEditor({
  event,
  race,
  onClose,
  onEdit,
}: {
  event: EventState;
  race: RunnerRace;
  onClose: () => void;
  onEdit: (body: Record<string, unknown>) => Promise<void>;
}) {
  const r = race.runner;
  const [bibDraft, setBibDraft] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ tapId?: string; markId?: string } | null>(null);

  async function del(index: number, tapId?: string, markId?: string) {
    await onEdit({ action: "pair-delete", index, actor: "admin" });
    setToast({ tapId, markId });
  }

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
            <div className="font-mono text-sm font-black tabular text-gold">{r.bib}</div>
          </div>
          <button
            type="button"
            className="tap h-12 rounded-xl bg-gold px-4 font-black text-ink"
            onClick={() => void onEdit({ action: "pair-insert-estimated", bib: r.bib, actor: "admin" })}
          >
            +~
          </button>
        </div>
        <div className="mt-4 space-y-2">
          {race.crossings.length === 0 ? (
            <p className="py-8 text-center text-sm text-dim">No crossings</p>
          ) : (
            race.crossings.map((c, i) => {
              const split = race.splitMs[i];
              const estSplit = splitEstimated(race.crossings, i);
              const draft = bibDraft[c.markId] ?? c.bib;
              return (
                <div key={c.tapId} className="rounded-2xl bg-panel2 p-3 ring-1 ring-line">
                  <div className="flex items-center gap-2">
                    <span className="w-6 font-mono text-xs font-black tabular text-dim">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-xl font-black tabular">
                        {formatEst(formatClock(c.elapsedMs), c.estimated)}
                      </div>
                      {split != null ? (
                        <div className="font-mono text-xs font-bold tabular text-gold">
                          {formatEst(formatClock(split, 1), estSplit)}
                        </div>
                      ) : null}
                    </div>
                    <Field
                      value={draft}
                      onChange={(v) => setBibDraft((d) => ({ ...d, [c.markId]: v }))}
                      placeholder="Bib"
                      inputMode="numeric"
                      className="h-12 w-20 font-mono text-xl font-black tabular"
                      onSubmit={() => {
                        if (draft && draft !== c.bib) {
                          void onEdit({
                            action: "reassign",
                            index: c.index,
                            bib: draft,
                            actor: "admin",
                          });
                        }
                      }}
                    />
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      className="tap h-12 rounded-xl bg-panel font-black ring-1 ring-line"
                      disabled={c.index <= 0}
                      onClick={() =>
                        void onEdit({ action: "move", index: c.index, to: c.index - 1, actor: "admin" })
                      }
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="tap h-12 rounded-xl bg-panel font-black ring-1 ring-line"
                      onClick={() =>
                        void onEdit({ action: "move", index: c.index, to: c.index + 1, actor: "admin" })
                      }
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="tap h-12 rounded-xl bg-stop/20 font-black text-stop ring-1 ring-stop"
                      onClick={() => void del(c.index, c.tapId, c.markId)}
                    >
                      Del
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <button
          type="button"
          className="tap mt-4 h-14 w-full rounded-2xl bg-panel2 font-bold ring-1 ring-line"
          onClick={onClose}
        >
          Close
        </button>
      </div>
      {toast ? (
        <UndoToast
          message="Crossing deleted"
          onUndo={() => {
            void onEdit({
              action: "restore-last",
              actor: "admin",
              tapId: toast.tapId,
              markId: toast.markId,
            });
            setToast(null);
          }}
          onGone={() => setToast(null)}
        />
      ) : null}
    </div>
  );
}
