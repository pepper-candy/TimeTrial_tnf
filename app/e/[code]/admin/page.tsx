"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { PinGate } from "@/components/pin-gate";
import { Qr } from "@/components/qr";
import { BigBtn, Chip, Field, MenuButton, Screen, TopBar, useCopied } from "@/components/shell";
import { LoadingState } from "@/components/states";
import { CrossingEditor } from "@/components/crossing-editor";
import { MismatchPanel } from "@/components/mismatch-panel";
import { fetchWithPin, json, useEvent } from "@/lib/client/hooks";
import { forgetAdmin, rememberAdmin, setStoredPin } from "@/lib/client/pin";
import { preparePhotos } from "@/lib/client/photo";
import { CATEGORIES } from "@/lib/category";
import { kmCrossings } from "@/lib/course";
import { eventLinks, helperShareText } from "@/lib/share";
import { formatStorage, storageRatio } from "@/lib/storage";
import type { EventState, Runner } from "@/lib/types";

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
  const { event, setEvent, races, flags } = useEvent(code, 2000);
  const [draft, setDraft] = useState({ bib: "", name: "", studentId: "", category: "" });
  const [fixId, setFixId] = useState<string | null>(null);
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

  async function saveRunner(runner: Partial<Runner> & { bib?: string; id?: string }) {
    const data = await json<{ event: EventState }>(`/api/events/${code}/runners`, {
      method: "POST",
      body: JSON.stringify({ action: "upsert", runner }),
    });
    setEvent(data.event);
  }

  async function addDraft() {
    if (!draft.bib.trim()) return;
    await saveRunner({ ...draft });
    setDraft((d) => ({ bib: "", name: "", studentId: "", category: d.category }));
  }

  async function patch(body: Record<string, unknown>) {
    const data = await json<{ event: EventState }>(`/api/events/${code}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    setEvent(data.event);
  }

  async function start() {
    const data = await json<{ event: EventState }>(`/api/events/${code}/start`, {
      method: "POST",
    });
    setEvent(data.event);
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
                <div className="flex flex-wrap gap-2">
                  <Chip
                    active={event.hideStudentIds}
                    onClick={() => void patch({ hideStudentIds: !event.hideStudentIds })}
                  >
                    Hide IDs
                  </Chip>
                </div>
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
        info="Timer taps. Marker enters bibs in order. The server pairs them. Alerts below show count lag, too-fast laps and extra taps or bibs. Tap Fix on a runner to shift, delete or add an estimated (~) crossing."
      />

      <div className="flex-1 space-y-4 px-4 pb-28">
        <AccessCard code={code} event={event} origin={origin} />

        {event.status !== "setup" ? (
          <MismatchPanel
            code={code}
            event={event}
            flags={flags}
            onEvent={setEvent}
            onFixRunner={setFixId}
          />
        ) : null}

        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-[11px] font-black uppercase tracking-[0.16em] text-dim">Runners</h2>
            <span className="font-mono text-2xl font-black tabular">{event.runners.length}</span>
          </div>
          <div className="space-y-2">
            <div className="rounded-2xl bg-panel p-2 ring-1 ring-accent/60">
              <div className="flex items-center gap-2">
                <input
                  value={draft.bib}
                  onChange={(e) => setDraft((d) => ({ ...d, bib: e.target.value }))}
                  placeholder="Bib"
                  aria-label="Bib"
                  inputMode="numeric"
                  className="h-12 w-16 rounded-xl bg-panel2 px-2 text-center font-mono text-2xl font-black tabular placeholder:text-base placeholder:text-dim"
                />
                <input
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder="Name"
                  aria-label="Name"
                  className="h-12 min-w-0 flex-1 rounded-xl bg-panel2 px-3 placeholder:text-dim"
                />
                <input
                  value={draft.studentId}
                  onChange={(e) => setDraft((d) => ({ ...d, studentId: e.target.value }))}
                  placeholder="SID"
                  aria-label="Student ID"
                  className="h-12 w-20 rounded-xl bg-panel2 px-2 font-mono text-sm font-bold tabular placeholder:text-dim sm:w-28"
                  onKeyDown={(e) => e.key === "Enter" && addDraft()}
                />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <CategoryChips
                  value={draft.category}
                  onChange={(category) => setDraft((d) => ({ ...d, category }))}
                />
                <button
                  type="button"
                  className="tap ml-auto h-12 rounded-xl bg-accent px-6 text-lg font-black text-ink disabled:opacity-40"
                  onClick={addDraft}
                  disabled={!draft.bib.trim()}
                >
                  Add
                </button>
              </div>
            </div>
            {event.runners.map((r) => (
              <RunnerRow
                key={r.id}
                runner={r}
                eventId={event.id}
                onChange={(next) => saveRunner({ id: r.id, ...next })}
                onPhoto={(f) => photo(r.id, f)}
                onFix={event.status === "setup" ? undefined : () => setFixId(r.id)}
                onDelete={async () => {
                  const data = await json<{ event: EventState }>(`/api/events/${code}/runners`, {
                    method: "POST",
                    body: JSON.stringify({ action: "delete", id: r.id }),
                  });
                  setEvent(data.event);
                }}
              />
            ))}
          </div>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-void via-void/95 to-transparent pt-6">
        <div className="mx-auto flex w-full max-w-3xl gap-2 px-4 pb-4">
          {event.status === "setup" ? (
            <BigBtn className="flex-1" onClick={start} disabled={event.runners.length === 0}>
              Start race
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
            />
          );
        })()
      ) : null}
    </Screen>
  );
}

function AccessCard({ code, event, origin }: { code: string; event: EventState; origin: string }) {
  const [pin, setPin] = useState<string | null | undefined>(undefined);
  const [shown, setShown] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [nextPin, setNextPin] = useState("");
  const [err, setErr] = useState(false);
  const [qr, setQr] = useState<"off" | "helper" | "board">("off");
  const { copied, copy } = useCopied();
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
    if (!/^\d{4,8}$/.test(value)) {
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

  const share = helperShareText({ origin, code: event.code, name: event.name, pin: pin ?? null });

  return (
    <section className="rounded-3xl bg-panel p-3 ring-1 ring-line">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void copy("code", event.code)}
          className="tap rounded-2xl bg-panel2 px-3 py-3 text-left ring-1 ring-line active:bg-sand active:text-ink"
          aria-label="Copy event code"
        >
          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-dim">
            {copied === "code" ? "Copied" : "Code"}
          </div>
          <div className="font-mono text-4xl font-black tabular tracking-[0.12em] sm:text-5xl">
            {event.code}
          </div>
        </button>
        <div className="flex rounded-2xl bg-panel2 ring-1 ring-line">
          <button
            type="button"
            onClick={() => (pin ? setShown((v) => !v) : setResetting(true))}
            className="tap min-w-0 flex-1 px-3 py-3 text-left"
            aria-label={shown ? "Hide PIN" : "Show PIN"}
          >
            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-dim">
              {pin === null ? "PIN" : shown ? "PIN" : "PIN · tap"}
            </div>
            <div className="font-mono text-4xl font-black tabular tracking-[0.12em] sm:text-5xl">
              {pin === undefined ? "…" : pin === null ? <span className="text-xl text-bell">Set</span> : shown ? pin : "••••"}
            </div>
          </button>
          {pin ? (
            <button
              type="button"
              onClick={() => void copy("pin", pin)}
              className="tap w-14 shrink-0 rounded-r-2xl border-l border-line text-xs font-black uppercase text-dim active:bg-sand active:text-ink"
              aria-label="Copy PIN"
            >
              {copied === "pin" ? "✓" : "Copy"}
            </button>
          ) : null}
        </div>
      </div>

      {resetting ? (
        <div className="mt-2 flex gap-2">
          <Field
            value={nextPin}
            onChange={(v) => {
              setNextPin(v.replace(/\D/g, "").slice(0, 8));
              setErr(false);
            }}
            placeholder="New PIN (4–8 digits)"
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

      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
        <button
          type="button"
          onClick={() => void copy("share", share)}
          className="tap h-14 rounded-2xl bg-accent px-3 text-lg font-black text-ink shadow-[inset_0_-4px_0_rgba(0,0,0,0.25)]"
        >
          {copied === "share" ? "Copied" : "Share helper"}
        </button>
        <button
          type="button"
          onClick={() => void copy("board", links.board)}
          className="tap h-14 rounded-2xl bg-panel2 px-4 font-black ring-1 ring-line"
        >
          {copied === "board" ? "✓" : "Board link"}
        </button>
        <button
          type="button"
          aria-pressed={qr !== "off"}
          onClick={() => setQr((v) => (v === "off" ? "helper" : "off"))}
          className={`tap h-14 rounded-2xl px-4 font-black ring-1 ${
            qr !== "off" ? "bg-sand text-ink ring-sand" : "bg-panel2 ring-line"
          }`}
        >
          QR
        </button>
      </div>

      {qr !== "off" ? (
        <div className="mt-3 flex flex-col items-center gap-2">
          <div className="flex gap-2">
            <Chip size="sm" active={qr === "helper"} onClick={() => setQr("helper")}>
              Helper
            </Chip>
            <Chip size="sm" active={qr === "board"} onClick={() => setQr("board")}>
              Board
            </Chip>
          </div>
          <Qr value={qr === "helper" ? links.home : links.board} />
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

function CategoryChips({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-2">
      {CATEGORIES.map((c) => (
        <Chip key={c} active={value === c} onClick={() => onChange(value === c ? "" : c)}>
          {c}
        </Chip>
      ))}
    </div>
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
    <BigBtn tone={confirm ? "danger" : "plain"} className="w-full" onClick={() => (confirm ? onDelete() : setConfirm(true))}>
      {confirm ? "Tap again to delete" : "Delete event"}
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
  const cam = useRef<HTMLInputElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [bib, setBib] = useState(runner.bib);
  const [name, setName] = useState(runner.name);
  const [studentId, setStudentId] = useState(runner.studentId);
  const [confirmDel, setConfirmDel] = useState(false);

  return (
    <div className="rounded-2xl bg-panel p-2 ring-1 ring-line">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="tap shrink-0"
          onClick={() => !runner.photoVer && cam.current?.click()}
          aria-label="Photo"
        >
          <Avatar runner={runner} eventId={eventId} size={48} lightbox={Boolean(runner.photoVer)} />
        </button>
        <input
          value={bib}
          onChange={(e) => setBib(e.target.value)}
          onBlur={() => bib !== runner.bib && onChange({ bib })}
          aria-label="Bib"
          className="h-12 w-16 bg-transparent text-center font-mono text-2xl font-black tabular"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== runner.name && onChange({ name })}
          placeholder="Name"
          aria-label="Name"
          className="h-12 min-w-0 flex-1 bg-transparent placeholder:text-dim"
        />
        <input
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          onBlur={() => studentId !== runner.studentId && onChange({ studentId })}
          placeholder="SID"
          aria-label="Student ID"
          className="hidden h-12 w-28 bg-transparent font-mono text-sm font-bold tabular placeholder:text-dim sm:block"
        />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <CategoryChips value={runner.category} onChange={(category) => onChange({ category })} />
        <div className="ml-auto flex gap-2">
          {onFix ? (
            <button
              type="button"
              className="tap h-12 rounded-xl bg-panel2 px-4 font-black text-accent ring-1 ring-line"
              onClick={onFix}
            >
              Fix
            </button>
          ) : null}
          <button
            type="button"
            className="tap h-12 w-12 rounded-xl bg-panel2 text-lg font-black text-dim ring-1 ring-line"
            onClick={() => file.current?.click()}
            aria-label="Upload photo"
          >
            ↑
          </button>
          <button
            type="button"
            className={`tap h-12 rounded-xl px-3 font-black ring-1 ${
              confirmDel ? "bg-stop text-sand ring-stop" : "bg-panel2 text-stop ring-line"
            }`}
            onClick={() => (confirmDel ? onDelete() : setConfirmDel(true))}
            onBlur={() => setConfirmDel(false)}
            aria-label="Remove runner"
          >
            {confirmDel ? "Remove" : "×"}
          </button>
        </div>
      </div>
      <input
        ref={cam}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onPhoto(e.target.files[0])}
      />
      <input
        ref={file}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onPhoto(e.target.files[0])}
      />
    </div>
  );
}
