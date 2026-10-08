"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { RaceClock } from "@/components/clock";
import { SwipeRow } from "@/components/swipe-row";
import { PinGate } from "@/components/pin-gate";
import { ICON_BTN, Screen, TopBar } from "@/components/shell";
import { LoadingState } from "@/components/states";
import { useHardwareKeys } from "@/lib/client/hardware-keys";
import { json, useEvent } from "@/lib/client/hooks";
import { applyBibKey, bibDigitWidth, bibPrompt, padBib } from "@/lib/marker-bib";
import { guessMissRunners } from "@/lib/miss-guess";
import { padKeyFromEvent } from "@/lib/pad-keys";
import { liveMarks, liveTaps, runnerByBib } from "@/lib/race";
import { hapticHoldOk, hapticTap } from "@/lib/haptic";
import { indexAfterSyncs, isLastVisibleBeforeCut, markPack, sinceLastSync, syncPadIds } from "@/lib/tap-list";
import type { EventState } from "@/lib/types";

type Pending = { id: string; bib: string };

const GROUP_HOLD_MS = 500;

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
  const missHold = useRef<number | null>(null);
  const missArmed = useRef(false);
  const [allReady, setAllReady] = useState(false);
  const [missOnly, setMissOnly] = useState(false);
  const groupHold = useRef<number | null>(null);
  const groupArmed = useRef(false);
  const [groupReady, setGroupReady] = useState(false);
  const canGroupRef = useRef(false);
  const [guess, setGuess] = useState<{ id: string; local: boolean } | null>(null);
  const guessRef = useRef(guess);
  guessRef.current = guess;

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
    hapticTap();
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
    if (guessRef.current) return;
    const roster = latest.current?.runners ?? event?.runners ?? [];
    const width = bibDigitWidth(roster.map((r) => r.bib));
    const next = applyBibKey(typedRef.current, key, width);
    typedRef.current = next.typed;
    setTyped(next.typed);
    buzz();
    if (next.submit) mark(next.submit);
  }

  function clearChoice() {
    typedRef.current = "";
    setTyped("");
  }

  function closeGuess() {
    setGuess(null);
    clearChoice();
  }

  function pickGuess(bib: string) {
    const roster = latest.current?.runners ?? event?.runners ?? [];
    const w = bibDigitWidth(roster.map((r) => r.bib));
    const next = padBib(bib, w);
    typedRef.current = next;
    setTyped(next);
    buzz();
  }

  function modifyGuess() {
    const g = guessRef.current;
    const bib = typedRef.current.trim();
    if (!g || !bib) return;
    buzz();
    if (g.local) {
      setPending((p) => p.map((x) => (x.id === g.id ? { ...x, bib } : x)));
      closeGuess();
      return;
    }
    const ev = latest.current;
    if (!ev || !ev.marks.some((m) => m.id === g.id && m.deletedAt == null)) return;
    const next = {
      ...ev,
      marks: ev.marks.map((m) => (m.id === g.id ? { ...m, bib } : m)),
    };
    latest.current = next;
    setEvent(next);
    closeGuess();
    later(async () => {
      try {
        await post({ action: "reassign", markId: g.id, bib });
      } catch {
        /* poll will restore */
      }
    });
  }

  useHardwareKeys((e) => {
    const g = guessRef.current;
    if (g) {
      const k = padKeyFromEvent(e);
      if (k === "clear" || k === "back") {
        if (typedRef.current) clearChoice();
        else closeGuess();
        return true;
      }
      if (k === "1" || k === "2" || k === "3") {
        const ev = latest.current;
        if (!ev) return true;
        const cands = guessMissRunners(ev, g.id, 3);
        const runner = cands[Number(k) - 1];
        if (runner) pickGuess(runner.bib);
        return true;
      }
      return true;
    }
    const k = padKeyFromEvent(e);
    if (!k || k === "enter") return false;
    if (e.repeat && k !== "back") return false;
    press(k);
    return true;
  });

  function clearTyped() {
    if (guessRef.current) {
      clearChoice();
      return;
    }
    press("clear");
  }

  function markMiss() {
    typedRef.current = "";
    setTyped("");
    buzz();
    mark("?");
  }

  function markAll() {
    typedRef.current = "";
    setTyped("");
    const bibs =
      (latest.current ?? event)?.runners
        .filter((r) => r.dnfAt == null && r.bib.trim())
        .map((r) => r.bib) ?? [];
    if (bibs.length === 0) return;
    const locals = bibs.map((bib) => ({ id: crypto.randomUUID(), bib }));
    setPending((p) => [...p, ...locals]);
    later(async () => {
      const still = locals.filter((x) => !dropped.current.has(x.id));
      for (const x of locals) dropped.current.delete(x.id);
      if (still.length === 0) {
        setPending((p) => p.filter((x) => !locals.some((l) => l.id === x.id)));
        return;
      }
      try {
        await post({ action: "append-many", bibs: still.map((x) => x.bib) });
        setPending((p) => p.filter((x) => !locals.some((l) => l.id === x.id)));
      } catch {
        setPending((p) => p.filter((x) => !locals.some((l) => l.id === x.id)));
      }
    });
  }

  function markGroup() {
    later(async () => {
      try {
        await post({ action: "group" });
      } catch {
        /* ignore */
      }
    });
  }

  function syncCut() {
    const ev = latest.current;
    const nT = liveTaps(ev?.taps ?? []).length;
    const nM = liveMarks(ev?.marks ?? []).length;
    if (nT === 0 && nM === 0) return;
    const last = (ev?.syncs ?? [])[(ev?.syncs ?? []).length - 1];
    if (last && last.taps === nT && last.marks === nM) return;
    hapticTap();
    later(async () => {
      try {
        await post({ action: "sync" });
      } catch {
        /* ignore */
      }
    });
  }

  function beginZeroHold(e: React.PointerEvent<HTMLButtonElement>) {
    e.preventDefault();
    if (guessRef.current) return;
    if (!canGroupRef.current) {
      press("0");
      return;
    }
    groupArmed.current = false;
    setGroupReady(false);
    if (groupHold.current) window.clearTimeout(groupHold.current);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    groupHold.current = window.setTimeout(() => {
      groupArmed.current = true;
      setGroupReady(true);
    }, GROUP_HOLD_MS);
  }

  function endZeroHold(commit: boolean) {
    if (guessRef.current) {
      if (commit) closeGuess();
      return;
    }
    const armed = groupArmed.current;
    const holding = groupHold.current != null || armed;
    if (groupHold.current) window.clearTimeout(groupHold.current);
    groupHold.current = null;
    groupArmed.current = false;
    setGroupReady(false);
    if (!commit || !holding) return;
    if (armed) {
      hapticHoldOk();
      markGroup();
    } else press("0");
  }

  function beginMissHold(e: React.PointerEvent<HTMLButtonElement>) {
    e.preventDefault();
    if (guessRef.current) return;
    missArmed.current = false;
    setAllReady(false);
    if (missHold.current) window.clearTimeout(missHold.current);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    missHold.current = window.setTimeout(() => {
      missArmed.current = true;
      setAllReady(true);
    }, 2000);
  }

  function endMissHold(commit: boolean) {
    if (guessRef.current) {
      if (commit) void modifyGuess();
      return;
    }
    if (missHold.current) window.clearTimeout(missHold.current);
    missHold.current = null;
    const armed = missArmed.current;
    missArmed.current = false;
    setAllReady(false);
    if (!commit) return;
    if (armed) {
      hapticHoldOk();
      markAll();
    } else markMiss();
  }

  function deleteRow(row: { id: string; bib: string; local: boolean }) {
    if (guessRef.current?.id === row.id) closeGuess();
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
  const liveIds = [...server.map((m) => m.id), ...pending.map((m) => m.id)];
  const padMarks = syncPadIds(event?.syncs).marks;
  const liveMarkRows = [
    ...server.map((m) => ({ id: m.id, bib: m.bib, local: false })),
    ...pending.map((m) => ({ id: m.id, bib: m.bib, local: true })),
  ];
  const rows = liveMarkRows
    .map((m, i) => ({
      ...m,
      n: indexAfterSyncs(i, "marks", event?.syncs),
      pack: markPack(i, liveIds, event?.groups),
      cutBefore: isLastVisibleBeforeCut(i, liveMarkRows, padMarks, event?.syncs, "marks"),
    }))
    .filter((m) => !padMarks.has(m.id))
    .reverse();
  const newest = rows[0]?.id ?? "";
  const afterCut = sinceLastSync(
    event ? liveTaps(event.taps).length : 0,
    server.length + pending.length,
    event?.syncs,
  );
  const shownRows = missOnly
    ? rows.filter((r) => !runnerByBib(event?.runners ?? [], r.bib))
    : rows;
  const lastServer = server[server.length - 1];
  const lastGrouped = Boolean(
    lastServer && (event?.groups ?? []).some((g) => g.afterId === lastServer.id),
  );
  const canGroup = pending.length > 0 || Boolean(lastServer && !lastGrouped);
  canGroupRef.current = canGroup;
  const lastSync = (event?.syncs ?? [])[(event?.syncs ?? []).length - 1];
  const liveTapN = event ? liveTaps(event.taps).length : 0;
  const liveMarkN = server.length;
  const canSync =
    (liveTapN > 0 || liveMarkN > 0 || pending.length > 0) &&
    !(lastSync && lastSync.taps === liveTapN && lastSync.marks === liveMarkN);

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [newest]);

  const liveIdKey = liveIds.join(",");
  useEffect(() => {
    if (!guess) return;
    if (liveIdKey.split(",").includes(guess.id)) return;
    setGuess(null);
    typedRef.current = "";
    setTyped("");
  }, [guess, liveIdKey]);

  useEffect(() => {
    return () => {
      if (missHold.current) window.clearTimeout(missHold.current);
      if (groupHold.current) window.clearTimeout(groupHold.current);
    };
  }, []);

  if (!event) {
    return (
      <Screen className="h-dvh max-h-dvh max-w-none overflow-hidden">
        <TopBar backHref={`/e/${code}`} title={code} />
        <LoadingState />
      </Screen>
    );
  }

  const prompt = bibPrompt(typed, width);
  const candidates = guess ? guessMissRunners(event, guess.id, 3) : [];
  const guessing = Boolean(guess);

  return (
    <Screen className="h-dvh max-h-dvh max-w-none overflow-hidden">
      <TopBar
        className="!mb-0"
        backHref={`/e/${code}`}
        leading={
          <button
            type="button"
            disabled={!canSync}
            className={`${ICON_BTN} disabled:opacity-30`}
            aria-label="Sync cutoff"
            onPointerDown={(e) => {
              e.preventDefault();
              if (!canSync) return;
              syncCut();
            }}
          >
            <SyncCutIcon />
          </button>
        }
        title={
          <div className="flex flex-col items-center leading-none">
            <RaceClock
              startedAt={event.startedAt}
              now={serverNow}
              className="text-3xl sm:text-4xl"
            />
            <p className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.16em] text-dim">
              {afterCut.taps} taps · {afterCut.marks} bibs
            </p>
          </div>
        }
        extra={
          <button
            type="button"
            aria-pressed={missOnly}
            aria-label={missOnly ? "Show all bibs" : "Show missing bibs"}
            className={`tap grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-xl font-black ring-1 ring-line ${
              missOnly ? "bg-sand text-ink" : "bg-panel2 text-bell"
            }`}
            onClick={() => setMissOnly((on) => !on)}
          >
            ?
          </button>
        }
        info="Type the bib in crossing order. It saves when every digit is filled. Tap the bib field or Clear to wipe digits. Miss if someone passed and you missed the bib. Hold Miss to add every runner again. Hold 0 to start a new pack. Tap a miss or unknown bib to see up to three likely runners from expected arrival. Pick one, then Modify. Return restores the pad. The ? filter shows only misses and unknown bibs. Sync draws a cutoff so the next tap and bib pair together even if counts differed before."
      />
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-0.5 pb-2">
        {missOnly && shownRows.length === 0 ? (
          <p className="px-6 py-16 text-center text-sm text-dim">No missing bibs.</p>
        ) : null}
        <ul className="flex flex-col gap-1.5">
          {shownRows.map((row, i) => {
            const runner = runnerByBib(event.runners, row.bib);
            const shown = padBib(row.bib, width);
            const sameAbove = i > 0 && shownRows[i - 1].pack === row.pack;
            const sameBelow = i < shownRows.length - 1 && shownRows[i + 1].pack === row.pack;
            return (
              <li key={row.id} className={`relative pl-4 ${row.cutBefore ? "pt-3" : ""}`}>
                {row.cutBefore ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute left-[18px] right-[2px] top-[5px] z-10 h-[3px] rounded-full bg-sky"
                  />
                ) : null}
                <span
                  aria-hidden
                  className="absolute left-0 w-[9px] rounded-full bg-go"
                  style={{
                    top: sameAbove ? "-0.5rem" : "0.15rem",
                    bottom: sameBelow ? "-0.5rem" : "0.15rem",
                  }}
                />
                <SwipeRow
                  label={`Delete bib ${shown}`}
                  onDelete={() => deleteRow(row)}
                  className={`rounded-xl ${
                    guess?.id === row.id
                      ? "bg-[color-mix(in_srgb,var(--color-sand)_18%,var(--color-panel))] ring-1 ring-sand/50"
                      : runner
                        ? "bg-panel2"
                        : "bg-[color-mix(in_srgb,var(--color-bell)_12%,var(--color-panel))] ring-1 ring-bell/40"
                  }`}
                >
                  <div
                    className="grid min-h-11 grid-cols-[2.5rem_auto_minmax(0,1fr)] items-center gap-2 px-3 py-1.5"
                    onClick={() => {
                      if (runner) return;
                      clearChoice();
                      setGuess({ id: row.id, local: row.local });
                    }}
                  >
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
        <button
          type="button"
          className="tap mb-2 grid h-12 w-full grid-cols-3 items-center rounded-[12px] bg-panel ring-1 ring-line"
          aria-label="Bib being typed. Tap to clear."
          onPointerDown={(e) => {
            e.preventDefault();
            clearTyped();
          }}
        >
          <span className="col-span-2 text-center font-mono text-4xl font-black tabular tracking-[0.08em]">
            {prompt.split("").map((ch, i) => (
              <span key={i} className={ch === "_" ? "text-dim/40" : "text-sand"}>
                {ch}
              </span>
            ))}
          </span>
          <span className={`text-lg font-black ${typed ? "text-sand" : "text-dim/40"}`}>Clear</span>
        </button>
        <div className="grid grid-cols-3 gap-2">
          {guessing ? (
            <>
              {[0, 1, 2].map((i) => {
                const cand = candidates[i];
                const selected = Boolean(cand && typed && padBib(cand.bib, width) === typed);
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={!cand}
                    aria-label={cand ? `Candidate ${cand.bib}` : "No candidate"}
                    className={`tap flex h-[13rem] flex-col items-center justify-end gap-2 overflow-hidden rounded-2xl p-1.5 leading-none ${
                      !cand
                        ? "bg-panel2/50 text-dim ring-1 ring-line"
                        : selected
                          ? "bg-go text-ink ring-1 ring-sand"
                          : "bg-panel2 text-sand ring-1 ring-line active:bg-sand active:text-ink"
                    }`}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      if (cand) pickGuess(cand.bib);
                    }}
                  >
                    {cand ? (
                      <>
                        <div className="min-h-0 w-full flex-1 overflow-hidden rounded-xl">
                          <Avatar
                            runner={cand}
                            eventId={event.id}
                            overlay={false}
                            fill
                          />
                        </div>
                        <span className="pb-1 font-mono text-2xl font-black tabular">{padBib(cand.bib, width)}</span>
                      </>
                    ) : (
                      <span className="pb-4 text-3xl font-black text-dim/40">—</span>
                    )}
                  </button>
                );
              })}
              <button
                type="button"
                className="tap col-span-2 flex h-16 items-center justify-center rounded-2xl bg-panel2 text-xl font-black text-sand ring-1 ring-line active:bg-sand active:text-ink"
                aria-label="Return to keypad"
                onPointerDown={(e) => {
                  e.preventDefault();
                  closeGuess();
                }}
              >
                Return
              </button>
              <button
                type="button"
                disabled={!typed}
                className="tap flex h-16 items-center justify-center rounded-2xl bg-stop text-xl font-black text-white disabled:opacity-40"
                aria-label="Modify bib"
                onPointerDown={(e) => e.preventDefault()}
                onPointerUp={(e) => {
                  e.preventDefault();
                  modifyGuess();
                }}
              >
                Modify
              </button>
            </>
          ) : (
            <>
              {PAD_KEYS.filter((key) => key.id !== "0").map((key) => (
                <button
                  key={key.id}
                  type="button"
                  className="tap h-16 rounded-2xl bg-panel2 font-black tabular text-2xl text-sand ring-1 ring-line active:bg-sand active:text-ink"
                  aria-label={key.label}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    press(key.id);
                  }}
                >
                  {key.face}
                </button>
              ))}
              <button
                type="button"
                className={`tap col-span-2 flex h-16 flex-col items-center justify-center rounded-2xl leading-none ${
                  groupReady ? "bg-go text-ink" : "bg-panel2 text-sand ring-1 ring-line active:bg-sand active:text-ink"
                }`}
                aria-label="0. Hold to make grouping."
                onPointerDown={beginZeroHold}
                onPointerUp={() => endZeroHold(true)}
                onPointerCancel={() => endZeroHold(false)}
                onContextMenu={(e) => e.preventDefault()}
              >
                <span className="text-2xl font-black tabular">0</span>
                <span
                  className={`text-[9px] font-bold uppercase tracking-[0.08em] ${
                    groupReady ? "text-ink/70" : "text-sand/80"
                  }`}
                >
                  Make Grouping (HOLD)
                </span>
              </button>
              <button
                type="button"
                className={`tap flex h-16 flex-col items-center justify-center rounded-2xl leading-none ${
                  allReady ? "bg-go text-ink" : "bg-stop text-white"
                }`}
                aria-label={allReady ? "Add all runners" : "Miss"}
                onPointerDown={beginMissHold}
                onPointerUp={() => endMissHold(true)}
                onPointerCancel={() => endMissHold(false)}
                onContextMenu={(e) => e.preventDefault()}
              >
                <span className="text-xl font-black">Miss</span>
                <span className={`text-[9px] font-bold uppercase tracking-[0.08em] ${allReady ? "text-ink/70" : "text-white/80"}`}>
                  Add ALL (HOLD)
                </span>
              </button>
            </>
          )}
        </div>
      </div>
    </Screen>
  );
}

function SyncCutIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none">
      <path
        d="M21 12a9 9 0 0 0-15.5-6.3L3 8"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 3v5h5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 12a9 9 0 0 0 15.5 6.3L21 16"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M21 21v-5h-5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
];

