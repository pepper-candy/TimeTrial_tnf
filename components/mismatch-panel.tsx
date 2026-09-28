"use client";

import { UndoToast } from "@/components/undo-toast";
import { json } from "@/lib/client/hooks";
import { formatClock, formatEst } from "@/lib/format";
import {
  MARKER_LAG_OK,
  liveMarks,
  sequenceLag,
  tapElapsed,
  unmatchedMarks,
  unmatchedTaps,
} from "@/lib/race";
import type { DataFlag, EventState } from "@/lib/types";
import { useState } from "react";

function flagLabel(f: DataFlag): string {
  if (f.kind === "count-lag") return f.detail;
  if (f.kind === "too-fast") return `Too fast #${f.bib}`;
  if (f.kind === "over-count") return `Over #${f.bib}`;
  if (f.kind === "unknown-bib") return `Bib? ${f.bib}`;
  return f.detail;
}

export function MismatchPanel({
  code,
  event,
  flags,
  onEvent,
  onFixRunner,
}: {
  code: string;
  event: EventState;
  flags: DataFlag[];
  onEvent: (e: EventState) => void;
  onFixRunner?: (runnerId: string) => void;
}) {
  const { taps, marks, lag } = sequenceLag(event);
  const extraTaps = unmatchedTaps(event.taps, event.marks);
  const extraMarks = unmatchedMarks(event.taps, event.marks);
  const hot = flags.length > 0;
  const [toast, setToast] = useState<{ action: string; id?: string; index?: number } | null>(null);

  async function edit(path: "taps" | "marks" | "crossings", body: Record<string, unknown>) {
    const data = await json<{ event: EventState }>(`/api/events/${code}/${path}`, {
      method: "POST",
      body: JSON.stringify({ ...body, actor: "admin" }),
    });
    onEvent(data.event);
    return data.event;
  }

  const lagOk = Math.abs(lag) <= MARKER_LAG_OK;

  return (
    <div className={`mx-4 mt-4 rounded-2xl p-3 ring-1 ${hot ? "bg-bell/10 ring-bell/50" : "bg-panel ring-line"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-mono text-lg font-black tabular">
          {taps} taps · {marks} bibs
        </div>
        <div className={`text-xs font-black uppercase tracking-wide ${lagOk ? "text-dim" : "text-bell"}`}>
          {lag === 0 ? "Matched" : lag > 0 ? `Lag ${lag}` : `Marks +${-lag}`}
        </div>
      </div>
      {flags.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {flags.slice(0, 8).map((f, i) => (
            <button
              key={`${f.kind}-${f.index}-${i}`}
              type="button"
              className="tap rounded-full bg-panel2 px-2.5 py-1 text-xs font-bold ring-1 ring-line"
              onClick={() => {
                const runner = event.runners.find((r) => r.id === f.runnerId || r.bib === f.bib);
                if (runner) onFixRunner?.(runner.id);
              }}
            >
              {flagLabel(f)}
            </button>
          ))}
        </div>
      ) : null}

      {extraTaps.length > 0 ? (
        <div className="mt-3">
          <div className="text-[11px] font-black uppercase tracking-wide text-dim">Extra taps</div>
          <div className="mt-1 flex gap-2 overflow-x-auto">
            {extraTaps.slice(-8).map((t) => (
              <button
                key={t.id}
                type="button"
                className="tap shrink-0 rounded-xl bg-stop/15 px-3 py-2 ring-1 ring-stop"
                onClick={async () => {
                  await edit("taps", { action: "tap-delete", id: t.id });
                  setToast({ action: "tap-restore", id: t.id });
                }}
              >
                <div className="font-mono text-sm font-black tabular">
                  {formatEst(formatClock(tapElapsed(event, t)), t.estimated)}
                </div>
                <div className="text-[10px] font-black text-stop">Del</div>
              </button>
            ))}
            <button
              type="button"
              className="tap h-12 shrink-0 rounded-xl bg-panel2 px-3 text-sm font-black text-gold ring-1 ring-line"
              onClick={() => void edit("taps", { action: "tap-insert-estimated" })}
            >
              +~
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <button
            type="button"
            className="tap h-11 rounded-xl bg-panel2 px-3 text-sm font-black text-gold ring-1 ring-line"
            onClick={() => void edit("taps", { action: "tap-insert-estimated" })}
          >
            +~ tap
          </button>
        </div>
      )}

      {extraMarks.length > 0 ? (
        <div className="mt-3">
          <div className="text-[11px] font-black uppercase tracking-wide text-dim">Extra bibs</div>
          <div className="mt-1 flex gap-2 overflow-x-auto">
            {extraMarks.slice(-8).map((m) => {
              const idx = liveMarks(event.marks).findIndex((x) => x.id === m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  className="tap shrink-0 rounded-xl bg-stop/15 px-3 py-2 font-mono text-lg font-black tabular ring-1 ring-stop"
                  onClick={async () => {
                    await edit("marks", { action: "delete", index: idx });
                    setToast({ action: "mark-restore", id: m.id });
                  }}
                >
                  {m.bib}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {toast ? (
        <UndoToast
          key={`${toast.action}-${toast.id}`}
          message="Deleted"
          onUndo={() => {
            if (toast.action === "tap-restore" && toast.id) {
              void edit("taps", { action: "tap-restore", id: toast.id });
            }
            if (toast.action === "mark-restore" && toast.id) {
              void edit("marks", { action: "mark-restore", id: toast.id });
            }
            setToast(null);
          }}
          onGone={() => setToast(null)}
        />
      ) : null}
    </div>
  );
}
