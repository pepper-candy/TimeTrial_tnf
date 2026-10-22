"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  analyseFinishClip,
  type AnalyseProgress,
  type LaneSuggestion,
} from "@/lib/client/analyse-finish";
import type { FinishCamMeta } from "@/lib/client/finish-cam";
import { acceptSprintFinish, acceptSprintFinishes } from "@/lib/client/sprint-records";
import { formatClock } from "@/lib/format";
import type { EventState } from "@/lib/types";
import { BigBtn } from "@/components/shell";

type Row = LaneSuggestion & {
  /** Editable elapsed ms string (seconds with decimals). */
  editMs: string;
  accepted: boolean;
};

export type FinishSnapshotPreview = {
  bib: string;
  lane: number;
  name: string;
  snapshotDataUrl: string;
  finishMs: number | null;
};

function msToEdit(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return "";
  return (ms / 1000).toFixed(2);
}

function editToMs(s: string): number | null {
  const n = Number(s.trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 1000);
}

export function FinishAnalysePanel({
  code,
  event,
  blob,
  meta,
  markInMs,
  markOutMs,
  onEvent,
  onLog,
  onStatus,
  onAnalyseStarted,
  onHasResults,
  onShowSnapshot,
  shownBib,
}: {
  code: string;
  event: EventState;
  blob: Blob | null;
  meta: FinishCamMeta | null;
  markInMs: number | null;
  markOutMs: number | null;
  onEvent: (e: EventState) => void;
  onLog: (msg: string) => void;
  onStatus: (s: string) => void;
  /** Fires once Analyse is tapped (and stays true through results / redo). */
  onAnalyseStarted?: () => void;
  onHasResults?: (has: boolean) => void;
  /** Show lane finish-frame on the Finish Cam preview stage. */
  onShowSnapshot?: (preview: FinishSnapshotPreview | null) => void;
  /** Bib currently shown on the stage (highlights Show). */
  shownBib?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<AnalyseProgress | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const timeInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  const markIn = meta?.markInMs ?? markInMs;
  const markOut = meta?.markOutMs ?? markOutMs;

  useEffect(() => {
    onHasResults?.(rows != null);
  }, [rows, onHasResults]);

  const runAnalyse = useCallback(async () => {
    if (!blob || markIn == null || markOut == null) {
      setErr("Need a recording with Mark 1 and Mark 2");
      return;
    }
    if (event.startedAt == null) {
      setErr("No start time — Starter bang required");
      return;
    }
    onAnalyseStarted?.();
    onShowSnapshot?.(null);
    setBusy(true);
    setErr(null);
    setProgress({ phase: "model", message: "Starting…", done: 0, total: 1 });
    onStatus("Analyse running…");
    try {
      const suggestions = await analyseFinishClip({
        blob,
        markInMs: markIn,
        markOutMs: markOut,
        recServerAt: meta?.recServerAt ?? event.startedAt,
        event,
        onProgress: setProgress,
      });
      setRows(
        suggestions.map((s) => ({
          ...s,
          editMs: msToEdit(s.finishMs),
          accepted: false,
        })),
      );
      onLog(
        `Analyse YOLO Mark1…Mark2 only [${markIn}…${markOut}] ms · ${suggestions.filter((s) => s.source === "yolo").length}/${suggestions.length} lanes detected`,
      );
      onStatus("Analyse ready — edit / Accept");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      onLog(`Analyse error: ${msg}`);
      onStatus("Analyse failed");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [blob, markIn, markOut, meta, event, onLog, onStatus, onAnalyseStarted, onShowSnapshot]);

  function updateEdit(bib: string, editMs: string) {
    setRows((prev) =>
      prev?.map((r) => (r.bib === bib ? { ...r, editMs, source: r.source } : r)) ?? null,
    );
  }

  function showRow(row: Row) {
    if (!row.snapshotDataUrl) {
      setErr(`Lane ${row.lane}: no finish-frame snapshot`);
      return;
    }
    onShowSnapshot?.({
      bib: row.bib,
      lane: row.lane,
      name: row.name,
      snapshotDataUrl: row.snapshotDataUrl,
      finishMs: editToMs(row.editMs) ?? row.finishMs,
    });
    onStatus(`Showing lane ${row.lane} finish frame`);
  }

  function focusTimeInput(bib: string) {
    const el = timeInputRefs.current.get(bib);
    if (!el || el.disabled) return;
    el.focus();
    el.select();
  }

  async function acceptOne(row: Row) {
    if (!event.startedAt) return;
    const finishMs = editToMs(row.editMs);
    if (finishMs == null) {
      setErr(`Lane ${row.lane}: enter a time`);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const tapT = event.startedAt + finishMs;
      const next = await acceptSprintFinish(code, row.bib, tapT);
      onEvent(next);
      setRows(
        (prev) =>
          prev?.map((r) =>
            r.bib === row.bib
              ? { ...r, finishMs, tapT, editMs: msToEdit(finishMs), accepted: true }
              : r,
          ) ?? null,
      );
      onLog(`Accepted lane ${row.lane} · ${formatClock(finishMs, 2)}`);
      onStatus(`Lane ${row.lane} saved`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function acceptAll() {
    if (!event.startedAt || !rows) return;
    const startedAt = event.startedAt;
    const batch = rows
      .map((r) => {
        const finishMs = editToMs(r.editMs);
        if (finishMs == null) return null;
        return { bib: r.bib, tapT: startedAt + finishMs, finishMs };
      })
      .filter((x): x is { bib: string; tapT: number; finishMs: number } => x != null);
    if (batch.length === 0) {
      setErr("Enter at least one time");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const next = await acceptSprintFinishes(
        code,
        batch.map(({ bib, tapT }) => ({ bib, tapT })),
      );
      if (next) onEvent(next);
      setRows(
        (prev) =>
          prev?.map((r) => {
            const hit = batch.find((b) => b.bib === r.bib);
            if (!hit) return r;
            return {
              ...r,
              finishMs: hit.finishMs,
              tapT: hit.tapT,
              editMs: msToEdit(hit.finishMs),
              accepted: true,
            };
          }) ?? null,
      );
      onLog(`Accepted ${batch.length} lane finish(es)`);
      onStatus("Finishes saved to board");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  /* Pre-results: single Analyse CTA. Results: scrollable lanes + sticky Redo | Accept All. */
  if (!rows) {
    return (
      <div className="flex flex-col gap-2">
        <BigBtn tone="go" className="w-full" disabled={busy || !blob} onClick={() => void runAnalyse()}>
          {busy && progress ? progress.message : "Analyse"}
        </BigBtn>
        {progress ? (
          <p className="text-xs font-semibold text-dim">
            {progress.message}
            {progress.total > 1 ? ` · ${progress.done}/${progress.total}` : ""}
          </p>
        ) : null}
        {err ? <p className="text-sm font-semibold text-stop">{err}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {err ? <p className="shrink-0 text-sm font-semibold text-stop">{err}</p> : null}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-2xl ring-1 ring-line">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-panel text-[10px] font-bold uppercase tracking-wider text-dim">
            <tr>
              <th className="w-8 px-1 py-2 sm:w-auto sm:px-2">
                <span className="sm:hidden">L</span>
                <span className="hidden sm:inline">Lane</span>
              </th>
              <th className="px-2 py-2">Athlete</th>
              <th className="w-[4.5rem] px-1 py-2 sm:w-auto sm:px-2">
                <span className="sm:hidden">Time</span>
                <span className="hidden sm:inline">Time (s)</span>
              </th>
              <th className="px-1 py-2 sm:px-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const showing = shownBib === r.bib;
              return (
                <tr
                  key={r.bib}
                  className={`border-t border-line/60${showing ? " bg-accent/10" : ""}`}
                >
                  <td
                    className="w-8 cursor-pointer px-1 py-2 font-mono font-bold sm:w-auto sm:px-2"
                    onClick={() => showRow(r)}
                  >
                    {r.lane}
                  </td>
                  <td className="cursor-pointer px-2 py-2" onClick={() => showRow(r)}>
                    <div className="font-semibold">{r.name || "—"}</div>
                    <div className="text-[10px] text-dim">
                      {r.source === "yolo" ? "YOLO" : "—"}
                      {r.accepted ? " · saved" : ""}
                    </div>
                  </td>
                  <td
                    className="w-[4.5rem] cursor-text px-1 py-2 sm:w-auto sm:px-2"
                    onClick={(e) => {
                      // Don't steal focus from nested controls; pad click → focus input.
                      if (e.target instanceof HTMLInputElement) return;
                      focusTimeInput(r.bib);
                    }}
                  >
                    <input
                      ref={(el) => {
                        if (el) timeInputRefs.current.set(r.bib, el);
                        else timeInputRefs.current.delete(r.bib);
                      }}
                      type="text"
                      inputMode="decimal"
                      className="w-14 rounded-lg bg-void px-1.5 py-1 font-mono text-sand ring-1 ring-line sm:w-24 sm:px-2"
                      value={r.editMs}
                      placeholder="—"
                      disabled={busy}
                      onChange={(e) => updateEdit(r.bib, e.target.value)}
                    />
                  </td>
                  <td className="px-1 py-2 text-right sm:px-2">
                    <div className="inline-flex items-center gap-1 sm:gap-1.5">
                      <button
                        type="button"
                        className={`rounded-lg px-2 py-1 text-xs font-bold ring-1 disabled:opacity-40 sm:px-2.5 ${
                          showing
                            ? "bg-accent/25 text-accent ring-accent/60"
                            : "bg-panel text-sand ring-line"
                        }`}
                        disabled={busy || !r.snapshotDataUrl}
                        onClick={() => showRow(r)}
                      >
                        Show
                      </button>
                      <button
                        type="button"
                        className="rounded-lg bg-go/20 px-2 py-1 text-xs font-bold text-go ring-1 ring-go/50 disabled:opacity-40 sm:px-2.5"
                        disabled={busy || !r.editMs.trim()}
                        onClick={() => void acceptOne(r)}
                      >
                        Accept
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="grid shrink-0 grid-cols-2 gap-2">
        <BigBtn tone="plain" className="w-full" disabled={busy || !blob} onClick={() => void runAnalyse()}>
          {busy && progress ? progress.message : "Redo"}
        </BigBtn>
        <BigBtn
          tone="accent"
          className="w-full"
          disabled={busy || !rows.some((r) => r.editMs.trim())}
          onClick={() => void acceptAll()}
        >
          Accept All
        </BigBtn>
      </div>
    </div>
  );
}
