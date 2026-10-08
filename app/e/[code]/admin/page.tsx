"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { SwipeRow } from "@/components/swipe-row";
import { TrashIcon } from "@/components/trash-icon";
import { PinGate } from "@/components/pin-gate";
import { Qr } from "@/components/qr";
import { BigBtn, Chip, Field, MenuButton, Screen, TopBar, useCopied } from "@/components/shell";
import { LoadingState } from "@/components/states";
import { CrossingEditor } from "@/components/crossing-editor";
import { DnfMark } from "@/components/avatar";
import { fetchWithPin, json, useEvent } from "@/lib/client/hooks";
import { forgetAdmin, getMasterKey, getStoredPin, rememberAdmin, setStoredPin } from "@/lib/client/pin";
import { preparePhotos } from "@/lib/client/photo";
import { kmCrossings } from "@/lib/course";
import { bibColor } from "@/lib/format";
import { photoPath } from "@/lib/photo";
import { normalizeBib } from "@/lib/race";
import { recordCounts } from "@/lib/records";
import { eventLinks, helperLink } from "@/lib/share";
import { formatStorage, storageRatio } from "@/lib/storage";
import type { EventState, Runner } from "@/lib/types";

function displayGone(
  runners: Runner[],
  gone: { runner: Runner; index: number } | null,
): { runner: Runner; index: number } | null {
  if (!gone) return null;
  const ordered = [...runners].reverse();
  const still = ordered.findIndex((r) => r.id === gone.runner.id);
  return { ...gone, index: still >= 0 ? still : Math.max(0, ordered.length - gone.index) };
}

function runnerSlots(
  runners: Runner[],
  gone: { runner: Runner; index: number } | null,
): Array<{ kind: "runner"; runner: Runner } | { kind: "gone" }> {
  const kept = runners.filter((r) => r.id !== gone?.runner.id);
  const slots: Array<{ kind: "runner"; runner: Runner } | { kind: "gone" }> = kept.map((runner) => ({
    kind: "runner",
    runner,
  }));
  if (gone) slots.splice(Math.min(gone.index, slots.length), 0, { kind: "gone" });
  return slots;
}

export default function AdminPage() {
  const { code } = useParams<{ code: string }>();
  return (
    <PinGate code={code}>
      <AdminInner code={code} />
    </PinGate>
  );
}

function AdminInner({ code }: { code: string }) {
  const router = useRouter();
  const { event, setEvent, races } = useEvent(code, 2000);
  const [draft, setDraft] = useState({ bib: "", name: "", studentId: "", category: "Boys" });
  const [draftPhoto, setDraftPhoto] = useState<File | null>(null);
  const [draftPreview, setDraftPreview] = useState<string | null>(null);
  const draftCamera = useRef<HTMLInputElement>(null);
  const [fixId, setFixId] = useState<string | null>(null);
  const [gone, setGone] = useState<{ runner: Runner; index: number } | null>(null);
  const goneRef = useRef<{ runner: Runner; index: number } | null>(null);
  const runnerChain = useRef(Promise.resolve());
  const [storage, setStorage] = useState<{ used: number; cap: number } | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  useEffect(() => {
    let alive = true;
    void fetchWithPin(`/api/events/${code}/storage`).then(async (res) => {
      if (!res.ok) return;
      const data = (await res.json()) as { used: number; cap: number };
      if (alive) setStorage(data);
    });
    return () => {
      alive = false;
    };
  }, [code, event?.rev]);

  const eventName = event?.name;
  useEffect(() => {
    if (eventName != null) rememberAdmin(code, eventName);
  }, [code, eventName]);

  const postRunners = useCallback((body: Record<string, unknown>) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const pin = getStoredPin(code);
    if (pin) headers["X-TT-PIN"] = pin;
    const key = getMasterKey();
    if (key) headers["X-TT-KEY"] = key;
    return fetch(`/api/events/${code}/runners`, {
      method: "POST",
      keepalive: true,
      headers,
      body: JSON.stringify(body),
    }).then(async (res) => {
      if (!res.ok) throw new Error(String(res.status));
      return res.json() as Promise<{ event: EventState }>;
    });
  }, [code]);

  useEffect(() => {
    return () => {
      const pending = goneRef.current;
      if (!pending) return;
      void postRunners({ action: "purge-photo", id: pending.runner.id });
    };
  }, [postRunners]);

  function removeRunner(runner: Runner) {
    if (!event) return;
    const index = event.runners.findIndex((r) => r.id === runner.id);
    const prev = goneRef.current;
    const next = { runner, index: index < 0 ? 0 : index };
    goneRef.current = next;
    setGone(next);
    runnerChain.current = runnerChain.current
      .then(async () => {
        if (prev && prev.runner.id !== runner.id) {
          await postRunners({ action: "purge-photo", id: prev.runner.id }).catch(() => {});
        }
        const data = await postRunners({ action: "delete", id: runner.id });
        if (goneRef.current?.runner.id === runner.id) setEvent(data.event);
      })
      .catch(() => {});
  }

  function undoRunner() {
    const current = goneRef.current;
    if (!current) return;
    goneRef.current = null;
    setGone(null);
    runnerChain.current = runnerChain.current
      .then(async () => {
        const data = await postRunners({
          action: "upsert",
          runner: current.runner,
          index: current.index,
        });
        setEvent(data.event);
      })
      .catch(() => {});
  }

  async function saveRunner(runner: Partial<Runner> & { bib?: string; id?: string }) {
    const data = await json<{ event: EventState }>(`/api/events/${code}/runners`, {
      method: "POST",
      body: JSON.stringify({ action: "upsert", runner }),
    });
    setEvent(data.event);
    return data.event;
  }

  function clearDraftPhoto() {
    setDraftPreview((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
    setDraftPhoto(null);
  }

  async function addDraft() {
    if (!draft.bib.trim() || !event) return;
    if (event.runners.some((r) => normalizeBib(r.bib) === normalizeBib(draft.bib))) return;
    const before = new Set(event.runners.map((r) => r.id));
    const file = draftPhoto;
    try {
      const next = await saveRunner({ ...draft, category: draft.category === "Girls" ? "Girls" : "Boys" });
      const created = next.runners.find((r) => !before.has(r.id));
      if (file && created) await photo(created.id, file);
      setDraft((d) => ({ bib: "", name: "", studentId: "", category: d.category === "Girls" ? "Girls" : "Boys" }));
      clearDraftPhoto();
    } catch {
      /* bib already used, or the save failed */
    }
  }

  async function patch(body: Record<string, unknown>) {
    const data = await json<{ event: EventState }>(`/api/events/${code}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    setEvent(data.event);
  }

  async function markReady() {
    if (!event || event.ready) return;
    const prev = event;
    setEvent({ ...event, ready: true });
    try {
      await patch({ ready: true });
    } catch {
      setEvent(prev);
    }
  }

  async function photo(runnerId: string, file: File) {
    try {
      const { thumb, full } = await preparePhotos(file);
      const form = new FormData();
      form.set(
        "thumb",
        new File([thumb.blob], thumb.mime === "image/webp" ? "t.webp" : "t.jpg", { type: thumb.mime }),
      );
      form.set(
        "full",
        new File(
          [full.blob],
          full.mime === "image/webp" ? "f.webp" : full.mime === "image/png" ? "f.png" : "f.jpg",
          { type: full.mime },
        ),
      );
      form.set("runnerId", runnerId);
      const res = await fetchWithPin(`/api/events/${code}/photo`, { method: "POST", body: form });
      if (!res.ok) return;
      const data = (await res.json()) as { event: EventState };
      setEvent(data.event);
    } catch {
      /* too large or canvas */
    }
  }

  if (!event) {
    return (
      <Screen>
        <TopBar backHref={`/e/${code}`} title="Admin" />
        <LoadingState rows={5} />
      </Screen>
    );
  }

  const bibTaken =
    draft.bib.trim() !== "" &&
    event.runners.some((r) => normalizeBib(r.bib) === normalizeBib(draft.bib));
  const kmOpts = kmCrossings(event.course).filter(
    (x) => x.km * 1000 < event.course.totalDistanceM - 0.5,
  );

  return (
    <Screen>
      <TopBar
        backHref={`/e/${code}`}
        title="Admin"
        menu={
          <MenuButton title="Settings">
            {(close) => (
              <div className="space-y-5">
                {kmOpts.length > 0 ? (
                  <div>
                    <div className="mb-2 text-[11px] font-black uppercase tracking-wider text-dim">
                      Result km
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {kmOpts.map((k) => (
                        <Chip
                          key={k.km}
                          active={event.resultKmSplits.includes(k.km)}
                          onClick={() => {
                            const cur = event.resultKmSplits;
                            const next = cur.includes(k.km)
                              ? cur.filter((x) => x !== k.km)
                              : [...cur, k.km].sort((a, b) => a - b);
                            void patch({ resultKmSplits: next });
                          }}
                        >
                          {k.km}K
                        </Chip>
                      ))}
                    </div>
                  </div>
                ) : null}
                {event.demo ? (
                  <div>
                    <div className="mb-2 text-[11px] font-black uppercase tracking-wider text-dim">
                      Demo
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Chip active={event.demoSpeed === 1} onClick={() => void patch({ demoSpeed: 1 })}>
                        1x
                      </Chip>
                      <Chip active={event.demoSpeed === 10} onClick={() => void patch({ demoSpeed: 10 })}>
                        10x
                      </Chip>
                      <Chip
                        active={event.demoAutoMark}
                        onClick={() => void patch({ demoAutoMark: !event.demoAutoMark })}
                      >
                        Auto mark
                      </Chip>
                    </div>
                  </div>
                ) : null}
                {storage ? <StorageBar used={storage.used} cap={storage.cap} /> : null}
                <DeleteButton
                  onDelete={async () => {
                    await fetchWithPin(`/api/events/${code}`, { method: "DELETE" });
                    forgetAdmin(code);
                    close();
                    router.push("/");
                  }}
                />
              </div>
            )}
          </MenuButton>
        }
        info="Timer taps. Marker enters bibs in order. The server pairs tap n with bib n. Modify records to delete, edit, or insert a tap or bib. Fix on a runner still shifts that runner's bibs."
      />

      <div className="flex-1 space-y-4 px-4 pb-28">
        <AccessCard code={code} event={event} origin={origin} />

        {event.status !== "setup" ? <ModifyRecordsLink code={code} event={event} /> : null}

        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-[11px] font-black uppercase tracking-[0.16em] text-dim">Runners</h2>
            <span className="font-mono text-2xl font-black tabular">
              {event.runners.filter((r) => r.id !== gone?.runner.id).length}
            </span>
          </div>
          <div className="space-y-2">
            <div className="rounded-2xl bg-panel p-2 ring-1 ring-accent/60">
              <div className="flex items-stretch gap-2">
                <button
                  type="button"
                  className="tap relative grid w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-panel2 text-3xl font-black text-dim ring-1 ring-line"
                  aria-label="Take photo"
                  onClick={() => draftCamera.current?.click()}
                >
                  {draftPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={draftPreview} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    "+"
                  )}
                </button>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex gap-2">
                    <input
                      value={draft.name}
                      onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                      placeholder="Name"
                      aria-label="Name"
                      className="h-12 min-w-0 flex-1 rounded-xl bg-panel2 px-3 placeholder:text-dim"
                    />
                    <input
                      value={draft.bib}
                      onChange={(e) => setDraft((d) => ({ ...d, bib: e.target.value }))}
                      placeholder="Bib"
                      aria-label="Bib"
                      inputMode="numeric"
                      className={`h-12 w-20 shrink-0 rounded-xl bg-panel2 px-2 text-center font-mono text-2xl font-black tabular placeholder:text-base placeholder:text-dim ${
                        bibTaken ? "ring-1 ring-stop" : ""
                      }`}
                      aria-invalid={bibTaken}
                      title={bibTaken ? "Already used" : undefined}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      value={draft.studentId}
                      onChange={(e) => setDraft((d) => ({ ...d, studentId: e.target.value.slice(0, 8) }))}
                      placeholder="SID"
                      aria-label="Student ID"
                      inputMode="numeric"
                      maxLength={8}
                      className="h-10 w-28 shrink-0 rounded-xl bg-panel2 px-2 font-mono text-sm font-bold tabular placeholder:text-dim"
                      onKeyDown={(e) => e.key === "Enter" && addDraft()}
                    />
                    <button
                      type="button"
                      aria-label={draft.category === "Girls" ? "Female" : "Male"}
                      aria-pressed={draft.category === "Girls"}
                      className={`tap grid h-10 shrink-0 place-items-center rounded-xl bg-transparent px-3 text-sm font-black ring-1 ${
                        draft.category === "Girls"
                          ? "text-[#ff4d8a] ring-[#ff4d8a]"
                          : "text-sky ring-sky"
                      }`}
                      onClick={() =>
                        setDraft((d) => ({ ...d, category: d.category === "Girls" ? "Boys" : "Girls" }))
                      }
                    >
                      <span className="col-start-1 row-start-1">
                        {draft.category === "Girls" ? "FEMALE" : "MALE"}
                      </span>
                      <span className="invisible col-start-1 row-start-1" aria-hidden>
                        FEMALE
                      </span>
                    </button>
                    <button
                      type="button"
                      className="tap h-10 min-w-0 flex-1 rounded-xl bg-accent px-4 text-base font-black text-ink disabled:opacity-40"
                      onClick={addDraft}
                      disabled={!draft.bib.trim() || bibTaken}
                    >
                      Add
                    </button>
                  </div>
                </div>
                <input
                  ref={draftCamera}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => {
                    const picked = e.target.files?.[0];
                    e.target.value = "";
                    if (!picked) return;
                    setDraftPreview((url) => {
                      if (url) URL.revokeObjectURL(url);
                      return URL.createObjectURL(picked);
                    });
                    setDraftPhoto(picked);
                  }}
                />
              </div>
            </div>
            {runnerSlots([...event.runners].reverse(), displayGone(event.runners, gone)).map((slot) =>
              slot.kind === "gone" ? (
                <button
                  key="deleted-runner"
                  type="button"
                  className="tap flex h-20 w-full items-center justify-center rounded-2xl bg-panel text-sm font-black ring-1 ring-line"
                  onClick={undoRunner}
                >
                  <span className="text-dim">Deleted</span>
                  <span className="px-1.5 text-dim">·</span>
                  <span className="text-accent">Undo</span>
                </button>
              ) : (
                <RunnerRow
                  key={slot.runner.id}
                  runner={slot.runner}
                  eventId={event.id}
                  onChange={(next) => saveRunner({ id: slot.runner.id, ...next })}
                  onPhoto={(f) => photo(slot.runner.id, f)}
                  onFix={event.status === "setup" ? undefined : () => setFixId(slot.runner.id)}
                  onDelete={() => removeRunner(slot.runner)}
                />
              ),
            )}
          </div>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-void via-void/95 to-transparent pt-6">
        <div className="mx-auto flex w-full max-w-3xl gap-2 px-4 pb-4">
          {event.status === "setup" ? (
            <BigBtn
              className={`flex-1 ${event.ready ? "disabled:opacity-100" : ""}`}
              tone={event.ready ? "go" : "accent"}
              onClick={event.ready ? undefined : markReady}
              disabled={event.ready || event.runners.length === 0}
            >
              READY
            </BigBtn>
          ) : event.status === "running" ? (
            <>
              <BigBtn className="flex-1" tone="plain" href={`/e/${code}/board`}>
                Board
              </BigBtn>
              <EndButton onEnd={() => void patch({ status: "finished" })} />
            </>
          ) : (
            <>
              <BigBtn className="flex-1" tone="plain" href={`/e/${code}/board`}>
                Board
              </BigBtn>
              <BigBtn className="flex-1" href={`/e/${code}/stats`}>
                Results
              </BigBtn>
            </>
          )}
        </div>
      </div>

      {fixId ? (
        (() => {
          const race = races.find((x) => x.runner.id === fixId);
          if (!race) return null;
          return (
            <CrossingEditor
              event={event}
              race={race}
              onClose={() => setFixId(null)}
              onEdit={async (body) => {
                const data = await json<{ event: EventState }>(`/api/events/${code}/crossings`, {
                  method: "POST",
                  body: JSON.stringify(body),
                });
                setEvent(data.event);
              }}
              onDnf={async (dnf) => {
                const data = await json<{ event: EventState }>(`/api/events/${code}/runners`, {
                  method: "POST",
                  body: JSON.stringify({
                    action: "upsert",
                    runner: { id: race.runner.id, dnfAt: dnf ? Date.now() : null },
                  }),
                });
                setEvent(data.event);
              }}
            />
          );
        })()
      ) : null}
    </Screen>
  );
}

function ModifyRecordsLink({ code, event }: { code: string; event: EventState }) {
  const counts = recordCounts(event.taps, event.marks);
  return (
    <Link
      href={`/e/${code}/admin/records`}
      aria-label={`Modify records, ${counts.taps} taps, ${counts.bibs} bibs${
        counts.differ ? ", counts differ" : ""
      }`}
      className="launch launch-solid tap relative flex min-h-36 w-full flex-col items-center justify-center gap-1 rounded-[10px] bg-accent px-4 text-ink"
    >
      {counts.differ ? (
        <span className="absolute right-4 top-4 h-3.5 w-3.5 rounded-full bg-bell ring-2 ring-ink" />
      ) : null}
      <span className="text-3xl font-black uppercase tracking-[0.08em] sm:text-4xl">Modify records</span>
      <span className="font-mono text-sm font-bold tabular text-ink/80">
        {counts.taps} taps · {counts.bibs} bibs
      </span>
    </Link>
  );
}

function AccessCard({ code, event, origin }: { code: string; event: EventState; origin: string }) {
  const [pin, setPin] = useState<string | null | undefined>(undefined);
  const [shown, setShown] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [nextPin, setNextPin] = useState("");
  const [err, setErr] = useState(false);
  const [qr, setQr] = useState<"off" | "helper" | "board">("off");
  const { copied, copy } = useCopied(1500);
  const links = eventLinks(origin, event.code);

  const load = useCallback(async () => {
    const res = await fetchWithPin(`/api/events/${code}/access`, { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { pin: string | null };
    setPin(data.pin);
  }, [code]);

  useEffect(() => {
    const kick = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(kick);
  }, [load]);

  async function savePin() {
    const value = nextPin.trim();
    if (!/^\d{4}$/.test(value)) {
      setErr(true);
      return;
    }
    const res = await fetchWithPin(`/api/events/${code}/access`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: value }),
    });
    if (!res.ok) {
      setErr(true);
      return;
    }
    setStoredPin(code, value);
    setPin(value);
    setShown(true);
    setResetting(false);
    setNextPin("");
    setErr(false);
  }

  const helperUrl = helperLink(origin, event.code);

  return (
    <section className="rounded-3xl bg-panel p-3 ring-1 ring-line">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void copy("code", event.code)}
          className={`tap min-w-0 rounded-2xl px-3 py-3 text-left ring-1 ring-line ${
            copied === "code" ? "bg-sand text-ink" : "bg-panel2 active:bg-sand active:text-ink"
          }`}
          aria-label="Copy event code"
        >
          <CopyLabel
            on={copied === "code"}
            className={`text-[11px] uppercase tracking-[0.16em] ${copied === "code" ? "text-ink/70" : "text-dim"}`}
          >
            Code
          </CopyLabel>
          <div className="flex h-12 items-center overflow-hidden whitespace-nowrap font-mono text-4xl font-black leading-none tabular tracking-[0.12em] sm:h-14 sm:text-5xl">
            {event.code}
          </div>
        </button>
        <button
          type="button"
          onClick={() => {
            if (!pin) {
              setResetting(true);
              return;
            }
            setShown(true);
            void copy("pin", pin);
          }}
          className={`tap min-w-0 rounded-2xl px-3 py-3 text-left ring-1 ring-line ${
            copied === "pin" ? "bg-sand text-ink" : "bg-panel2 active:bg-sand active:text-ink"
          }`}
          aria-label={pin ? "Show and copy PIN" : "Set PIN"}
        >
          <CopyLabel
            on={copied === "pin"}
            className={`text-[11px] uppercase tracking-[0.16em] ${copied === "pin" ? "text-ink/70" : "text-dim"}`}
          >
            {pin === null ? "PIN" : shown ? "PIN" : "PIN · tap"}
          </CopyLabel>
          <div
            className={`flex h-12 items-center overflow-hidden whitespace-nowrap font-mono font-black leading-none tabular sm:h-14 ${
              (shown || copied === "pin") && pin && pin.length > 5
                ? "text-[1.35rem] tracking-normal sm:text-4xl"
                : "text-4xl tracking-[0.12em] sm:text-5xl"
            }`}
          >
            {pin === undefined ? (
              "…"
            ) : pin === null ? (
              <span className="text-xl text-bell">Set</span>
            ) : shown || copied === "pin" ? (
              pin
            ) : (
              "••••"
            )}
          </div>
        </button>
      </div>

      {resetting ? (
        <div className="mt-2 flex gap-2">
          <Field
            value={nextPin}
            onChange={(v) => {
              setNextPin(v.replace(/\D/g, "").slice(0, 4));
              setErr(false);
            }}
            placeholder="New PIN (4 digits)"
            inputMode="numeric"
            autoFocus
            invalid={err}
          />
          <button
            type="button"
            className="tap h-14 shrink-0 rounded-2xl bg-accent px-5 text-lg font-black text-ink"
            onClick={() => void savePin()}
          >
            Save
          </button>
          <button
            type="button"
            className="tap h-14 w-14 shrink-0 rounded-2xl bg-panel2 text-xl font-black ring-1 ring-line"
            onClick={() => {
              setResetting(false);
              setErr(false);
            }}
            aria-label="Cancel"
          >
            ×
          </button>
        </div>
      ) : null}

      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_max-content_max-content] gap-2">
        <button
          type="button"
          onClick={() => void copy("share", helperUrl)}
          className="tap flex h-14 min-w-0 items-center justify-center overflow-hidden rounded-2xl bg-accent px-3 text-lg font-black text-ink shadow-[inset_0_-4px_0_rgba(0,0,0,0.25)]"
        >
          <CopyLabel on={copied === "share"}>Share helper</CopyLabel>
        </button>
        <button
          type="button"
          onClick={() => void copy("board", links.board)}
          className="tap flex h-14 items-center justify-center rounded-2xl bg-panel2 px-4 font-black ring-1 ring-line"
        >
          <CopyLabel on={copied === "board"}>Board link</CopyLabel>
        </button>
        <button
          type="button"
          aria-pressed={qr !== "off"}
          onClick={() => setQr((v) => (v === "off" ? "helper" : "off"))}
          className={`tap flex h-14 w-14 items-center justify-center rounded-2xl font-black ring-1 ${
            qr !== "off" ? "bg-sand text-ink ring-sand" : "bg-panel2 ring-line"
          }`}
        >
          QR
        </button>
      </div>

      {qr !== "off" ? (
        <div className="mt-3 flex flex-col items-center gap-2">
          <div className="grid w-44 grid-cols-2 gap-2">
            <Chip size="sm" active={qr === "helper"} onClick={() => setQr("helper")} className="w-full">
              Helper
            </Chip>
            <Chip size="sm" active={qr === "board"} onClick={() => setQr("board")} className="w-full">
              Board
            </Chip>
          </div>
          <Qr value={qr === "helper" ? helperUrl : links.board} />
        </div>
      ) : null}

      {pin && !resetting ? (
        <button
          type="button"
          className="tap mt-2 w-full py-1 text-xs font-bold uppercase tracking-wider text-dim"
          onClick={() => setResetting(true)}
        >
          Reset PIN
        </button>
      ) : null}
    </section>
  );
}

/** Both labels stay in the layout, so swapping to "Copied" cannot resize the control. */
function CopyLabel({
  on,
  children,
  className = "",
}: {
  on: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`inline-grid font-black ${className}`}>
      <span className={`col-start-1 row-start-1 whitespace-nowrap ${on ? "invisible" : ""}`}>{children}</span>
      <span className={`col-start-1 row-start-1 whitespace-nowrap ${on ? "" : "invisible"}`}>Copied</span>
    </span>
  );
}

function StorageBar({ used, cap }: { used: number; cap: number }) {
  const ratio = storageRatio(used, cap);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[11px] font-black uppercase tracking-wide text-dim">
        <span>Storage</span>
        <span className="font-mono tabular">
          {formatStorage(used)} / {formatStorage(cap)}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-panel2 ring-1 ring-line">
        <div
          className={`h-full ${ratio > 0.85 ? "bg-bell" : "bg-accent"}`}
          style={{ width: `${Math.max(2, ratio * 100)}%` }}
        />
      </div>
    </div>
  );
}

function DeleteButton({ onDelete }: { onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <BigBtn
      tone="plain"
      className={`w-full ${confirm ? "shadow-[inset_0_0_0_2px_#ff3b5c]" : ""}`}
      onClick={() => (confirm ? onDelete() : setConfirm(true))}
    >
      <span className="inline-flex items-center gap-2">
        <TrashIcon size={22} className="text-stop" />
        <span className={confirm ? "text-stop" : undefined}>
          {confirm ? "Tap again to delete" : "Delete event"}
        </span>
      </span>
    </BigBtn>
  );
}

function EndButton({ onEnd }: { onEnd: () => void }) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!confirm) return;
    const id = window.setTimeout(() => setConfirm(false), 3000);
    return () => window.clearTimeout(id);
  }, [confirm]);
  return (
    <BigBtn
      className="flex-1"
      tone={confirm ? "danger" : "accent"}
      onClick={() => (confirm ? onEnd() : setConfirm(true))}
    >
      {confirm ? "Sure?" : "End race"}
    </BigBtn>
  );
}

function RunnerRow({
  runner,
  eventId,
  onChange,
  onPhoto,
  onDelete,
  onFix,
}: {
  runner: Runner;
  eventId: string;
  onChange: (r: Partial<Runner>) => void;
  onPhoto: (file: File) => void;
  onDelete: () => void;
  onFix?: () => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(runner.name);
  const [studentId, setStudentId] = useState(runner.studentId);
  const female = runner.category === "Girls";
  const src = runner.photoVer ? photoPath(eventId, runner.id, runner.photoVer, "thumb") : null;

  return (
    <SwipeRow
      label={runner.name ? `Remove ${runner.name}` : "Remove runner"}
      onDelete={onDelete}
      className="rounded-2xl bg-panel ring-1 ring-line"
    >
      <div className="flex items-stretch gap-2 p-2">
        <button
          type="button"
          className="tap relative grid w-16 shrink-0 place-items-center self-stretch overflow-hidden rounded-xl bg-panel2 ring-1 ring-line"
          aria-label={`Replace photo for bib ${runner.bib}`}
          onClick={() => file.current?.click()}
        >
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <span className="absolute inset-0" style={{ background: bibColor(runner.bib || runner.name || "?") }} />
          )}
          <span className="absolute inset-0 bg-black/45" />
          <span className="relative font-mono text-2xl font-black tabular text-white [text-shadow:0_1px_2px_#000]">
            {runner.bib}
          </span>
          {runner.dnfAt != null ? <DnfMark size={56} /> : null}
        </button>
        <div className="flex min-h-16 min-w-0 flex-1 items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-col">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name !== runner.name && onChange({ name })}
              placeholder="Name"
              aria-label="Name"
              className="h-6 min-w-0 bg-transparent py-0 text-lg font-black leading-none placeholder:text-dim"
            />
            <div className="mt-0.5 flex h-5 items-center gap-2">
              <button
                type="button"
                className={`tap shrink-0 py-0 text-sm font-black leading-none ${female ? "text-[#ff4d8a]" : "text-sky"}`}
                aria-label={female ? "Female" : "Male"}
                onClick={() => onChange({ category: female ? "Boys" : "Girls" })}
              >
                {female ? "FEMALE" : "MALE"}
              </button>
              <span className="text-dim">·</span>
              <input
                value={studentId}
                onChange={(e) => setStudentId(e.target.value.slice(0, 8))}
                onBlur={() => studentId !== runner.studentId && onChange({ studentId })}
                placeholder="SID"
                aria-label="Student ID"
                inputMode="numeric"
                maxLength={8}
                className="h-5 w-28 shrink-0 bg-transparent py-0 font-mono text-sm font-bold leading-none tabular placeholder:text-dim"
              />
            </div>
          </div>
          {onFix ? (
            <button
              type="button"
              className="tap h-10 shrink-0 rounded-xl bg-panel2 px-4 font-black text-accent ring-1 ring-line"
              onClick={onFix}
            >
              Fix
            </button>
          ) : null}
        </div>
        <input
          ref={file}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const picked = e.target.files?.[0];
            e.target.value = "";
            if (picked) onPhoto(picked);
          }}
        />
      </div>
    </SwipeRow>
  );
}
