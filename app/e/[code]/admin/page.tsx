"use client";

import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { Qr } from "@/components/qr";
import { Chip, GoldBtn, HelpTip, Screen, TopBar } from "@/components/shell";
import { json, useEvent } from "@/lib/client/hooks";
import { compressImage } from "@/lib/client/photo";
import type { EventState, Runner } from "@/lib/types";

export default function AdminPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { event, setEvent, refresh } = useEvent(code, 2000);
  const [share, setShare] = useState(false);
  const [draft, setDraft] = useState({ bib: "", name: "", studentId: "" });
  const [confirmDel, setConfirmDel] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

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
    setDraft({ bib: "", name: "", studentId: "" });
  }

  async function start() {
    const data = await json<{ event: EventState }>(`/api/events/${code}/start`, {
      method: "POST",
    });
    setEvent(data.event);
  }

  async function photo(runnerId: string, file: File) {
    try {
      const { blob, mime } = await compressImage(file);
      const form = new FormData();
      form.set("file", new File([blob], mime === "image/webp" ? "p.webp" : "p.jpg", { type: mime }));
      form.set("runnerId", runnerId);
      const res = await fetch(`/api/events/${code}/photo`, { method: "POST", body: form });
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
      </Screen>
    );
  }

  const joinUrl = `${origin}/e/${event.code}`;

  return (
    <Screen>
      <TopBar
        backHref={`/e/${code}`}
        title={event.code}
        right={
          <HelpTip text="Add bibs before start. Share the code with Timer, Marker, and Board." />
        }
      />
      <div className="flex items-center justify-between px-4">
        <button
          type="button"
          className="tap rounded-xl bg-panel2 px-3 py-2 font-mono text-2xl font-bold tracking-widest"
          onClick={() => setShare((v) => !v)}
        >
          {event.code}
        </button>
        <div className="flex gap-2">
          <Chip onClick={() => navigator.clipboard.writeText(joinUrl)}>Copy</Chip>
          <Chip onClick={() => setShare((v) => !v)}>QR</Chip>
          {event.demo ? (
            <Chip
              active={event.demoAutoMark}
              onClick={async () => {
                await json(`/api/events/${code}`, {
                  method: "PATCH",
                  body: JSON.stringify({ demoAutoMark: !event.demoAutoMark }),
                });
                refresh();
              }}
            >
              Auto
            </Chip>
          ) : null}
        </div>
      </div>
      {share ? (
        <div className="mt-4 flex justify-center">
          <Qr value={joinUrl} />
        </div>
      ) : null}

      <div className="mt-5 flex-1 space-y-2 overflow-auto px-4 pb-4">
        {event.runners.map((r) => (
          <RunnerRow
            key={r.id}
            runner={r}
            onChange={(next) => saveRunner({ id: r.id, ...next })}
            onPhoto={(f) => photo(r.id, f)}
            eventId={event.id}
            onDelete={async () => {
              const data = await json<{ event: EventState }>(`/api/events/${code}/runners`, {
                method: "POST",
                body: JSON.stringify({ action: "delete", id: r.id }),
              });
              setEvent(data.event);
            }}
          />
        ))}
        <div className="flex items-center gap-2 rounded-2xl bg-panel p-2">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-panel2 text-dim">+</div>
          <input
            value={draft.bib}
            onChange={(e) => setDraft((d) => ({ ...d, bib: e.target.value }))}
            placeholder="Bib"
            inputMode="numeric"
            className="h-12 w-16 bg-transparent font-mono text-2xl font-bold"
          />
          <input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="Name"
            className="h-12 min-w-0 flex-1 bg-transparent"
          />
          <input
            value={draft.studentId}
            onChange={(e) => setDraft((d) => ({ ...d, studentId: e.target.value }))}
            placeholder="SID"
            className="h-12 w-24 bg-transparent font-mono text-sm"
            onKeyDown={(e) => e.key === "Enter" && addDraft()}
          />
          <button
            type="button"
            className="tap h-12 rounded-xl bg-gold px-3 font-bold text-ink"
            onClick={addDraft}
          >
            Add
          </button>
        </div>
      </div>

      <div className="space-y-2 px-4 pb-6">
        {event.status === "running" ? (
          <GoldBtn href={`/e/${code}/board`}>Board</GoldBtn>
        ) : event.status === "finished" ? (
          <GoldBtn href={`/e/${code}/stats`}>Stats</GoldBtn>
        ) : (
          <GoldBtn onClick={start} disabled={event.runners.length === 0}>
            Start
          </GoldBtn>
        )}
        {event.status === "running" ? (
          <button
            type="button"
            className="tap h-12 w-full rounded-2xl bg-panel2 font-semibold"
            onClick={async () => {
              await json(`/api/events/${code}`, {
                method: "PATCH",
                body: JSON.stringify({ status: "finished" }),
              });
              refresh();
            }}
          >
            Finish
          </button>
        ) : null}
        <button
          type="button"
          className={`tap h-12 w-full rounded-2xl font-semibold ${confirmDel ? "bg-stop text-sand" : "bg-panel2"}`}
          onClick={async () => {
            if (!confirmDel) {
              setConfirmDel(true);
              return;
            }
            await fetch(`/api/events/${code}`, { method: "DELETE" });
            router.push("/");
          }}
        >
          {confirmDel ? "Confirm delete" : "Delete"}
        </button>
      </div>
    </Screen>
  );
}

function RunnerRow({
  runner,
  eventId,
  onChange,
  onPhoto,
  onDelete,
}: {
  runner: Runner;
  eventId: string;
  onChange: (r: Partial<Runner>) => void;
  onPhoto: (file: File) => void;
  onDelete: () => void;
}) {
  const cam = useRef<HTMLInputElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [bib, setBib] = useState(runner.bib);
  const [name, setName] = useState(runner.name);
  const [studentId, setStudentId] = useState(runner.studentId);

  return (
    <div className="flex items-center gap-2 rounded-2xl bg-panel p-2">
      <button type="button" className="tap" onClick={() => cam.current?.click()}>
        <Avatar runner={runner} eventId={eventId} size={48} />
      </button>
      <input
        value={bib}
        onChange={(e) => setBib(e.target.value)}
        onBlur={() => bib !== runner.bib && onChange({ bib })}
        className="h-12 w-16 bg-transparent font-mono text-2xl font-bold"
      />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name !== runner.name && onChange({ name })}
        placeholder="Name"
        className="h-12 min-w-0 flex-1 bg-transparent"
      />
      <input
        value={studentId}
        onChange={(e) => setStudentId(e.target.value)}
        onBlur={() => studentId !== runner.studentId && onChange({ studentId })}
        placeholder="SID"
        className="h-12 w-24 bg-transparent font-mono text-sm"
      />
      <button type="button" className="tap text-dim" onClick={() => file.current?.click()}>
        ↑
      </button>
      <button type="button" className="tap text-stop" onClick={onDelete}>
        ×
      </button>
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
