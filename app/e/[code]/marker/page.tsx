"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { RaceClock } from "@/components/clock";
import { SwipeRow } from "@/components/swipe-row";
import { PinGate } from "@/components/pin-gate";
import { Screen, TopBar } from "@/components/shell";
import { LoadingState } from "@/components/states";
import { json, useEvent } from "@/lib/client/hooks";
import { applyBibKey, bibDigitWidth, bibPrompt, padBib } from "@/lib/marker-bib";
import { liveMarks, runnerByBib } from "@/lib/race";
import type { EventState } from "@/lib/types";

type Pending = { id: string; bib: string };

export default function MarkerPage() {
  const { code } = useParams<{ code: string }>();
  return (
    <PinGate code={code}>
      <MarkerInner code={code} />
    </PinGate>
  );
}

function MarkerInner({ code }: { code: string }) {
  const { event, setEvent, serverNow } = useEvent(code, 800);
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState<Pending[]>([]);
  const [gone, setGone] = useState<string[]>([]);
  const latest = useRef<EventState | null>(null);
  const typedRef = useRef("");
  const chain = useRef(Promise.resolve());
  const dropped = useRef(new Set<string>());
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    latest.current = event;
  }, [event]);

  function later(task: () => Promise<void>) {
    chain.current = chain.current.then(task, task);
  }

  async function post(body: Record<string, unknown>) {
    const data = await json<{ event: EventState }>(`/api/events/${code}/marks`, {
      method: "POST",
      body: JSON.stringify({ ...body, actor: "marker" }),
    });
    latest.current = data.event;
    setEvent(data.event);
    return data.event;
  }

  function buzz() {
    try {
      navigator.vibrate?.(12);
    } catch {
      /* ignore */
    }
  }

  function mark(padded: string) {
    const localId = crypto.randomUUID();
    setPending((p) => [...p, { id: localId, bib: padded }]);
    later(async () => {
      if (dropped.current.has(localId)) {
        dropped.current.delete(localId);
        setPending((p) => p.filter((x) => x.id !== localId));
        return;
      }
      try {
        const before = new Set(liveMarks(latest.current?.marks ?? []).map((m) => m.id));
        const next = await post({ action: "append", bib: padded });
        setPending((p) => p.filter((x) => x.id !== localId));
        const added = liveMarks(next.marks).find((m) => !before.has(m.id));
        if (dropped.current.has(localId)) {
          dropped.current.delete(localId);
          if (added) await post({ action: "delete", id: added.id });
        }
      } catch {
        setPending((p) => p.filter((x) => x.id !== localId));
      }
    });
  }

  function press(key: string) {
    const roster = latest.current?.runners ?? event?.runners ?? [];
    const width = bibDigitWidth(roster.map((r) => r.bib));
    const next = applyBibKey(typedRef.current, key, width);
    typedRef.current = next.typed;
    setTyped(next.typed);
    buzz();
    if (next.submit) mark(next.submit);
  }

  function deleteRow(row: { id: string; bib: string; local: boolean }) {
    if (row.local) {
      dropped.current.add(row.id);
      setPending((p) => p.filter((x) => x.id !== row.id));
      return;
    }
    setGone((g) => (g.includes(row.id) ? g : [...g, row.id]));
    later(async () => {
      try {
        await post({ action: "delete", id: row.id });
      } catch {
        setGone((g) => g.filter((x) => x !== row.id));
      }
    });
  }

  const width = bibDigitWidth((event?.runners ?? []).map((r) => r.bib));
  const hidden = new Set(gone);
  const server = event ? liveMarks(event.marks).filter((m) => !hidden.has(m.id)) : [];
  const rows = [
    ...server.map((m) => ({ id: m.id, bib: m.bib, local: false })),
    ...pending.map((m) => ({ id: m.id, bib: m.bib, local: true })),
  ]
    .map((m, i) => ({ ...m, n: i + 1 }))
    .reverse();
  const newest = rows[0]?.id ?? "";

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [newest]);

  if (!event) {
    return (
      <Screen className="h-dvh max-h-dvh max-w-none overflow-hidden">
        <TopBar backHref={`/e/${code}`} title={code} />
        <LoadingState />
      </Screen>
    );
  }

  const prompt = bibPrompt(typed, width);

  return (
    <Screen className="h-dvh max-h-dvh max-w-none overflow-hidden">
      <TopBar
        className="!mb-0"
        backHref={`/e/${code}`}
        title={
          <div className="flex flex-col items-center leading-none">
            <RaceClock
              startedAt={event.startedAt}
              now={serverNow}
              className="text-3xl sm:text-4xl"
            />
            <p className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.16em] text-dim">
              {rows.length} {rows.length === 1 ? "bib" : "bibs"}
            </p>
          </div>
        }
        info="Type the bib in crossing order. It saves when every digit is filled. Swipe a row to drop a bib."
      />
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-0.5 pb-2">
        <ul className="flex flex-col gap-1.5">
          {rows.map((row) => {
            const runner = runnerByBib(event.runners, row.bib);
            const shown = padBib(row.bib, width);
            return (
              <li key={row.id}>
                <SwipeRow
                  label={`Delete bib ${shown}`}
                  onDelete={() => deleteRow(row)}
                  className={`rounded-xl ${
                    runner
                      ? "bg-panel2"
                      : "bg-[color-mix(in_srgb,var(--color-bell)_12%,var(--color-panel))] ring-1 ring-bell/40"
                  }`}
                >
                  <div className="grid min-h-11 grid-cols-[2.5rem_auto_minmax(0,1fr)] items-center gap-2 px-3 py-1.5">
                    <span className="font-mono text-sm font-bold tabular text-dim">
                      {String(row.n).padStart(2, "0")}
                    </span>
                    {runner ? (
                      <Avatar runner={runner} eventId={event.id} size={40} overlay={false} />
                    ) : (
                      <span className="grid h-10 w-10 place-items-center rounded-xl bg-panel font-black text-bell">
                        ?
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block font-mono text-2xl font-black leading-none tabular">{shown}</span>
                      <span className="mt-1 block h-4 truncate text-xs font-semibold text-dim">
                        {runner?.name ?? ""}
                      </span>
                    </span>
                  </div>
                </SwipeRow>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="shrink-0 rounded-t-3xl bg-[color-mix(in_srgb,var(--color-panel2)_40%,var(--color-panel))] px-3 pt-4 pb-[max(12px,env(safe-area-inset-bottom))]">
        <div
          className="mb-2 flex h-12 items-center justify-center rounded-[12px] bg-panel font-mono text-4xl font-black tabular tracking-[0.08em] ring-1 ring-line"
          aria-label="Bib being typed"
        >
          <span>
            {prompt.split("").map((ch, i) => (
              <span key={i} className={ch === "_" ? "text-dim/40" : "text-sand"}>
                {ch}
              </span>
            ))}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {PAD_KEYS.map((key) => (
            <button
              key={key.id}
              type="button"
              className={`tap h-16 rounded-2xl bg-panel2 font-black tabular text-sand ring-1 ring-line active:bg-sand active:text-ink ${
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
    </Screen>
  );
}

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

