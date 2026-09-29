"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { SwipeRow } from "@/components/swipe-row";
import { PinGate } from "@/components/pin-gate";
import { Chip, Screen, TopBar } from "@/components/shell";
import { LoadingState } from "@/components/states";
import { json, useEvent } from "@/lib/client/hooks";
import { formatEst } from "@/lib/format";
import { applyBibKey, bibDigitWidth, bibPrompt, padBib } from "@/lib/marker-bib";
import { runnerByBib } from "@/lib/race";
import {
  RECORD_TAG_LABEL,
  applyTimeKey,
  recordCounts,
  recordRowTags,
  recordRows,
  timePrompt,
  type RecordRow,
  type RecordTag,
} from "@/lib/records";
import { formatStopwatch } from "@/lib/tap-list";
import type { EventState } from "@/lib/types";

const ROW_H = 140;

type Editor =
  | { mode: "time"; index: number; tapId: string }
  | { mode: "bib-edit" | "bib-insert"; index: number; markId?: string };

type Hist =
  | { kind: "tap-delete"; id: string }
  | { kind: "tap-insert"; id: string }
  | { kind: "mark-delete"; id: string }
  | { kind: "mark-insert"; id: string }
  | { kind: "reassign"; id: string; prevBib: string }
  | { kind: "time"; id: string; prevT: number; estimated: boolean };

export default function RecordsPage() {
  const { code } = useParams<{ code: string }>();
  return (
    <PinGate code={code}>
      <RecordsInner code={code} />
    </PinGate>
  );
}

function RecordsInner({ code }: { code: string }) {
  const { event, setEvent } = useEvent(code, 1500);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [filter, setFilter] = useState<"all" | "flagged">("all");
  const [typed, setTyped] = useState("");
  const [hist, setHist] = useState<Hist[]>([]);
  const latest = useRef<EventState | null>(null);
  const histRef = useRef<Hist[]>([]);
  const typedRef = useRef("");
  const editorRef = useRef<Editor | null>(null);
  const chain = useRef(Promise.resolve());

  useEffect(() => {
    latest.current = event;
  }, [event]);
  useEffect(() => {
    histRef.current = hist;
  }, [hist]);

  function later(task: () => Promise<void>) {
    chain.current = chain.current.then(task, task);
  }

  function remember(entry: Hist) {
    setHist((h) => {
      const next = [...h, entry].slice(-40);
      histRef.current = next;
      return next;
    });
  }

  async function post(path: "taps" | "marks", body: Record<string, unknown>) {
    const data = await json<{ event: EventState }>(`/api/events/${code}/${path}`, {
      method: "POST",
      body: JSON.stringify({ ...body, actor: "admin" }),
    });
    latest.current = data.event;
    setEvent(data.event);
    return data.event;
  }

  function buzz() {
    try {
      navigator.vibrate?.(10);
    } catch {
      /* ignore */
    }
  }

  function closeEditor() {
    editorRef.current = null;
    typedRef.current = "";
    setEditor(null);
    setTyped("");
  }

  function openEditor(next: Editor) {
    editorRef.current = next;
    typedRef.current = "";
    setEditor(next);
    setTyped("");
  }

  function deleteTap(row: RecordRow) {
    const id = row.tap?.id;
    if (!id) return;
    later(async () => {
      await post("taps", { action: "tap-delete", id });
      remember({ kind: "tap-delete", id });
    });
  }

  function deleteBib(row: RecordRow) {
    const id = row.mark?.id;
    if (!id) return;
    later(async () => {
      await post("marks", { action: "delete", id });
      remember({ kind: "mark-delete", id });
    });
  }

  function insertTap(index: number) {
    later(async () => {
      const before = new Set((latest.current?.taps ?? []).map((t) => t.id));
      const next = await post("taps", { action: "tap-insert-at", index });
      const added = next.taps.find((t) => !before.has(t.id));
      if (added) remember({ kind: "tap-insert", id: added.id });
    });
  }

  function insertBib(index: number, bib: string) {
    later(async () => {
      const before = new Set((latest.current?.marks ?? []).map((m) => m.id));
      const next = await post("marks", { action: "insert", index, bib });
      const added = next.marks.find((m) => !before.has(m.id));
      if (added) remember({ kind: "mark-insert", id: added.id });
    });
  }

  function press(key: string) {
    const ed = editorRef.current;
    if (!ed) return;
    buzz();
    if (ed.mode === "time") {
      const res = applyTimeKey(typedRef.current, key);
      typedRef.current = res.typed;
      setTyped(res.typed);
      if (res.submitMs == null) return;
      const id = ed.tapId;
      const submitMs = res.submitMs;
      closeEditor();
      later(async () => {
        const prev = latest.current?.taps.find((t) => t.id === id);
        const started = latest.current?.startedAt ?? 0;
        await post("taps", { action: "tap-set-time", id, t: started + submitMs });
        if (prev && prev.t !== started + submitMs) {
          remember({ kind: "time", id, prevT: prev.t, estimated: Boolean(prev.estimated) });
        }
      });
      return;
    }
    const width = bibDigitWidth((latest.current?.runners ?? []).map((r) => r.bib));
    const res = applyBibKey(typedRef.current, key, width);
    typedRef.current = res.typed;
    setTyped(res.typed);
    if (!res.submit) return;
    const index = ed.index;
    const markId = ed.markId;
    const mode = ed.mode;
    const prevBib = latest.current?.marks.find((m) => m.id === markId)?.bib;
    closeEditor();
    if (mode === "bib-insert") {
      insertBib(index, res.submit);
      return;
    }
    later(async () => {
      await post("marks", { action: "reassign", index, bib: res.submit });
      if (markId && prevBib != null) remember({ kind: "reassign", id: markId, prevBib });
    });
  }

  function undo() {
    const last = histRef.current[histRef.current.length - 1];
    if (!last) return;
    const next = histRef.current.slice(0, -1);
    histRef.current = next;
    setHist(next);
    later(async () => {
      try {
        if (last.kind === "tap-delete") await post("taps", { action: "tap-restore", id: last.id });
        else if (last.kind === "tap-insert") await post("taps", { action: "tap-delete", id: last.id });
        else if (last.kind === "mark-delete") await post("marks", { action: "restore-mark", id: last.id });
        else if (last.kind === "mark-insert") await post("marks", { action: "delete", id: last.id });
        else if (last.kind === "time") {
          await post("taps", {
            action: "tap-set-time",
            id: last.id,
            t: last.prevT,
            estimated: last.estimated,
          });
        }
        else if (last.kind === "reassign") {
          const marks = latest.current?.marks ?? [];
          const index = marks.filter((m) => m.deletedAt == null).findIndex((m) => m.id === last.id);
          if (index >= 0) await post("marks", { action: "reassign", index, bib: last.prevBib });
        }
      } catch {
        histRef.current = [...histRef.current, last].slice(-40);
        setHist(histRef.current);
      }
    });
  }

  if (!event) {
    return (
      <Screen>
        <TopBar backHref={`/e/${code}/admin`} title="Records" />
        <LoadingState rows={6} />
      </Screen>
    );
  }

  const rows = recordRows(event);
  const tagLists = recordRowTags(event, rows);
  const visible = filter === "all" ? rows : rows.filter((_, i) => tagLists[i].length > 0);
  const counts = recordCounts(event.taps, event.marks);
  const width = bibDigitWidth(event.runners.map((r) => r.bib));
  const prompt = editor?.mode === "time" ? timePrompt(typed) : bibPrompt(typed, width);

  return (
    <Screen className="h-dvh max-h-dvh overflow-hidden">
      <TopBar
        backHref={`/e/${code}/admin`}
        title="Records"
        info="Row n is timer tap n beside marker bib n. A short tag marks a suspicious row. All / Flagged filters the list. Delete, edit, or insert either side. Undo puts back the last change from this phone."
      />
      <p
        className={`h-5 shrink-0 text-center text-[11px] font-bold uppercase tracking-[0.16em] ${
          counts.differ ? "text-bell" : "text-dim"
        }`}
      >
        {counts.taps} taps · {counts.bibs} bibs
      </p>
      <div className="flex shrink-0 gap-2 px-3 pb-2">
        <Chip size="sm" active={filter === "all"} onClick={() => setFilter("all")}>
          All
        </Chip>
        <Chip size="sm" active={filter === "flagged"} onClick={() => setFilter("flagged")}>
          Flagged
        </Chip>
      </div>
      <Windowed
        key={filter}
        count={visible.length}
        empty={filter === "flagged" ? "No flagged rows." : "No taps or bibs yet."}
      >
        {(index) => {
          const row = visible[index];
          if (!row) return null;
          return (
            <RecordLine
              row={row}
              tags={tagLists[row.index] ?? []}
              eventId={event.id}
              runners={event.runners}
              width={width}
              editing={editor?.index === row.index ? editor.mode : null}
              onDeleteTap={() => deleteTap(row)}
              onDeleteBib={() => deleteBib(row)}
              onEditTime={() => {
                const tap = row.tap;
                if (!tap) return;
                openEditor({ mode: "time", index: row.index, tapId: tap.id });
              }}
              onEditBib={() => {
                const mark = row.mark;
                if (!mark) return;
                openEditor({ mode: "bib-edit", index: row.index, markId: mark.id });
              }}
              onInsertTap={() => insertTap(row.index)}
              onInsertBib={() => openEditor({ mode: "bib-insert", index: row.index })}
            />
          );
        }}
      </Windowed>
      <div className="shrink-0 px-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        {editor ? (
          <div className="mb-2">
            <div className="mb-2 flex items-center gap-2">
              <div
                className="flex h-12 min-w-0 flex-1 items-center justify-center rounded-[12px] bg-panel font-mono text-3xl font-black tabular tracking-[0.08em] ring-1 ring-line"
                aria-label={editor.mode === "time" ? "Tap time being typed" : "Bib being typed"}
              >
                <span>
                  {prompt.split("").map((ch, i) => (
                    <span key={i} className={ch === "_" ? "text-dim/40" : "text-sand"}>
                      {ch}
                    </span>
                  ))}
                </span>
              </div>
              <button
                type="button"
                className="tap h-12 shrink-0 rounded-[12px] bg-panel2 px-3 text-sm font-black ring-1 ring-line"
                onClick={closeEditor}
              >
                Close
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {PAD_KEYS.map((key) => (
                <button
                  key={key.id}
                  type="button"
                  className={`tap h-14 rounded-2xl bg-panel2 font-black tabular text-sand ring-1 ring-line active:bg-sand active:text-ink ${
                    key.id === "0" ? "col-span-2" : ""
                  } ${key.id === "clear" ? "text-lg" : "text-2xl"}`}
                  aria-label={key.label}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    press(key.id);
                  }}
                >
                  {key.face}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <button
          type="button"
          className="tap h-12 w-full rounded-[12px] bg-panel2 text-base font-black uppercase tracking-[0.14em] ring-1 ring-line disabled:cursor-default disabled:text-dim/40 disabled:ring-line/50"
          onClick={undo}
          disabled={hist.length === 0}
        >
          Undo
        </button>
      </div>
    </Screen>
  );
}

function Windowed({
  count,
  empty,
  children,
}: {
  count: number;
  empty: string;
  children: (index: number) => React.ReactNode;
}) {
  const [range, setRange] = useState({ start: 0, end: 30 });
  function measure(el: HTMLDivElement) {
    const top = el.scrollTop;
    const view = el.clientHeight || 700;
    const start = Math.max(0, Math.floor(top / ROW_H) - 6);
    const end = Math.min(count, Math.ceil((top + view) / ROW_H) + 6);
    setRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }
  const start = range.start >= count ? 0 : range.start;
  const end = Math.min(count, Math.max(range.end, start));
  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      onScroll={(e) => measure(e.currentTarget)}
    >
      {count === 0 ? (
        <p className="px-6 py-16 text-center text-sm text-dim">{empty}</p>
      ) : (
        <div className="relative" style={{ height: count * ROW_H }}>
          {Array.from({ length: Math.max(0, end - start) }, (_, k) => {
            const index = start + k;
            return (
              <div
                key={index}
                className="absolute inset-x-0 px-3"
                style={{ top: index * ROW_H, height: ROW_H }}
              >
                {children(index)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RecordLine({
  row,
  eventId,
  runners,
  width,
  tags,
  editing,
  onDeleteTap,
  onDeleteBib,
  onEditTime,
  onEditBib,
  onInsertTap,
  onInsertBib,
}: {
  row: RecordRow;
  eventId: string;
  runners: EventState["runners"];
  width: number;
  tags: RecordTag[];
  editing: Editor["mode"] | null;
  onDeleteTap: () => void;
  onDeleteBib: () => void;
  onEditTime: () => void;
  onEditBib: () => void;
  onInsertTap: () => void;
  onInsertBib: () => void;
}) {
  const n = String(row.index + 1).padStart(2, "0");
  const runner = row.mark ? runnerByBib(runners, row.mark.bib) : undefined;
  const bib = row.mark ? padBib(row.mark.bib, width) : "";
  return (
    <div className="flex h-[134px] flex-col gap-1">
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-1.5">
        <SwipeRow
          label="Delete tap"
          disabled={!row.tap}
          onDelete={onDeleteTap}
          className={`h-full rounded-xl ${
            row.tap ? "bg-panel2" : "bg-bell/10 ring-1 ring-bell/40"
          }`}
        >
          <div className="flex h-full min-w-0 items-center gap-1.5 px-2">
            <span className="w-6 shrink-0 font-mono text-xs font-bold tabular text-dim">{n}</span>
            {row.tap && row.elapsedMs != null && row.splitMs != null ? (
              <span className="min-w-0">
                <span className="block truncate font-mono text-sm font-black tabular">
                  {formatEst(formatStopwatch(row.elapsedMs), row.estimated)}
                </span>
                <span className="block truncate font-mono text-[11px] font-bold tabular text-dim">
                  {formatStopwatch(row.splitMs, true)}
                </span>
              </span>
            ) : null}
          </div>
        </SwipeRow>
        <SwipeRow
          label="Delete bib"
          disabled={!row.mark}
          onDelete={onDeleteBib}
          className={`h-full rounded-xl ${
            row.mark ? "bg-panel2" : "bg-bell/10 ring-1 ring-bell/40"
          }`}
        >
          <div className="flex h-full min-w-0 items-center gap-1.5 px-2">
            {row.mark ? (
              <>
                {runner ? (
                  <Avatar runner={runner} eventId={eventId} size={36} overlay={false} lightbox={false} />
                ) : (
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-bell/10 font-black text-bell ring-1 ring-bell/40">
                    ?
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block font-mono text-lg font-black leading-none tabular">{bib}</span>
                  <span className="mt-0.5 block h-4 truncate text-[11px] font-semibold text-dim">
                    {runner?.name ?? ""}
                  </span>
                </span>
              </>
            ) : null}
          </div>
        </SwipeRow>
      </div>
      <div className="flex h-5 shrink-0 items-center gap-1 overflow-hidden">
        {tags.map((tag) => (
          <span
            key={tag}
            className={`inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-medium whitespace-nowrap ${TAG_CLASS[tag]}`}
          >
            {RECORD_TAG_LABEL[tag]}
          </span>
        ))}
      </div>
      <div className="grid shrink-0 grid-cols-2 gap-1.5">
        <div className="grid grid-cols-2 gap-1">
          <RowBtn label="Edit tap time" disabled={!row.tap} on={editing === "time"} onClick={onEditTime}>
            Time
          </RowBtn>
          <RowBtn label="Insert tap" onClick={onInsertTap}>
            + tap
          </RowBtn>
        </div>
        <div className="grid grid-cols-2 gap-1">
          <RowBtn label="Edit bib" disabled={!row.mark} on={editing === "bib-edit"} onClick={onEditBib}>
            Bib
          </RowBtn>
          <RowBtn label="Insert bib" on={editing === "bib-insert"} onClick={onInsertBib}>
            + bib
          </RowBtn>
        </div>
      </div>
    </div>
  );
}

function RowBtn({
  label,
  disabled,
  on,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  on?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const tone = on ? "bg-sand text-ink ring-sand" : "bg-panel text-sand ring-line";
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`tap grid h-8 place-items-center whitespace-nowrap rounded-lg px-0.5 text-[10px] font-black uppercase tracking-wide ring-1 disabled:text-dim/30 ${tone}`}
    >
      {children}
    </button>
  );
}

const TAG_CLASS: Record<RecordTag, string> = {
  "too-fast": "bg-stop/15 text-stop",
  duplicate: "bg-accent/15 text-accent",
  "too-slow": "bg-bell/15 text-bell",
  "unknown-bib": "bg-bell/15 text-bell",
  "no-tap": "bg-stop/15 text-stop",
  "no-bib": "bg-stop/15 text-stop",
  edited: "bg-sky/15 text-sky",
};

const PAD_KEYS: { id: string; face: string; label: string }[] = [
  { id: "1", face: "1", label: "1" },
  { id: "2", face: "2", label: "2" },
  { id: "3", face: "3", label: "3" },
  { id: "4", face: "4", label: "4" },
  { id: "5", face: "5", label: "5" },
  { id: "6", face: "6", label: "6" },
  { id: "7", face: "7", label: "7" },
  { id: "8", face: "8", label: "8" },
  { id: "9", face: "9", label: "9" },
  { id: "0", face: "0", label: "0" },
  { id: "clear", face: "Clear", label: "Clear" },
];
