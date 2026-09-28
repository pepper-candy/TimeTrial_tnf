"use client";

import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { PinGate } from "@/components/pin-gate";
import { Qr } from "@/components/qr";
import { Chip, Field, GoldBtn, HelpTip, Screen, TopBar } from "@/components/shell";
import { fetchWithPin, json, useEvent } from "@/lib/client/hooks";
import { compressImage } from "@/lib/client/photo";
import { kmCrossings } from "@/lib/course";
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
  const { event, setEvent } = useEvent(code, 2000);
  const [share, setShare] = useState<"off" | "board" | "helper">("off");
  const [draft, setDraft] = useState({ bib: "", name: "", studentId: "", category: "Girls" });
  const [customCat, setCustomCat] = useState("");
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
      const { blob, mime } = await compressImage(file);
      const form = new FormData();
      form.set("file", new File([blob], mime === "image/webp" ? "p.webp" : "p.jpg", { type: mime }));
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
      </Screen>
    );
  }

  const boardUrl = `${origin}/e/${event.code}/board`;
  const helperUrl = `${origin}/e/${event.code}`;
  const shareUrl = share === "helper" ? helperUrl : boardUrl;
  const kmOpts = kmCrossings(event.course).filter(
    (x) => x.km * 1000 < event.course.totalDistanceM - 0.5,
  );

  return (
    <Screen>
      <TopBar
        backHref={`/e/${code}`}
        title={event.code}
        right={
          <HelpTip text="Share the Board link publicly. Timer/Marker/Admin need the helper PIN. Add bib, name, SID, and category before start." />
        }
      />
      <div className="flex items-center justify-between px-4">
        <button
          type="button"
          className="tap rounded-xl bg-panel2 px-3 py-2 font-mono text-2xl font-bold tracking-widest"
          onClick={() => setShare((v) => (v === "off" ? "board" : "off"))}
        >
          {event.code}
        </button>
        <div className="flex flex-wrap justify-end gap-2">
          <Chip onClick={() => navigator.clipboard.writeText(boardUrl)}>Board</Chip>
          <Chip onClick={() => setShare((v) => (v === "board" ? "off" : "board"))}>QR</Chip>
          <Chip
            active={event.hideStudentIds}
            onClick={() => void patch({ hideStudentIds: !event.hideStudentIds })}
          >
            Hide IDs
          </Chip>
          {event.demo ? (
            <>
              <Chip
                active={event.demoSpeed === 1}
                onClick={() => void patch({ demoSpeed: 1 })}
              >
                1x
              </Chip>
              <Chip
                active={event.demoSpeed === 10}
                onClick={() => void patch({ demoSpeed: 10 })}
              >
                10x
              </Chip>
              <Chip
                active={event.demoAutoMark}
                onClick={() => void patch({ demoAutoMark: !event.demoAutoMark })}
              >
                Auto
              </Chip>
            </>
          ) : null}
        </div>
      </div>
      {share !== "off" ? (
        <div className="mt-4 flex flex-col items-center gap-2">
          <div className="flex gap-2">
            <Chip active={share === "board"} onClick={() => setShare("board")}>
              Board
            </Chip>
            <Chip active={share === "helper"} onClick={() => setShare("helper")}>
              Helper
            </Chip>
          </div>
          <Qr value={shareUrl} />
          <p className="px-4 text-center text-xs text-dim">{shareUrl}</p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2 px-4">
        {event.categories.map((c) => (
          <Chip key={c} active={draft.category === c} onClick={() => setDraft((d) => ({ ...d, category: c }))}>
            {c}
          </Chip>
        ))}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Field
            value={customCat}
            onChange={setCustomCat}
            placeholder="Open"
            className="h-10"
          />
          <Chip
            onClick={() => {
              const name = customCat.trim();
              if (!name) return;
              const next = event.categories.includes(name)
                ? event.categories
                : [...event.categories, name];
              void patch({ categories: next });
              setDraft((d) => ({ ...d, category: name }));
              setCustomCat("");
            }}
          >
            Add
          </Chip>
        </div>
      </div>

      {kmOpts.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 px-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-dim">Result km</span>
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
      ) : null}

      <div className="mt-5 flex-1 space-y-2 overflow-auto px-4 pb-4">
        {event.runners.map((r) => (
          <RunnerRow
            key={r.id}
            runner={r}
            categories={event.categories}
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
        <div className="rounded-2xl bg-panel p-2">
          <div className="flex items-center gap-2">
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
          <div className="mt-2 flex flex-wrap gap-2 pl-14">
            {event.categories.map((c) => (
              <Chip key={c} active={draft.category === c} onClick={() => setDraft((d) => ({ ...d, category: c }))}>
                {c}
              </Chip>
            ))}
          </div>
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
            onClick={() => void patch({ status: "finished" })}
          >
            End race
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
            await fetchWithPin(`/api/events/${code}`, { method: "DELETE" });
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
  categories,
  onChange,
  onPhoto,
  onDelete,
}: {
  runner: Runner;
  eventId: string;
  categories: string[];
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
    <div className="rounded-2xl bg-panel p-2">
      <div className="flex items-center gap-2">
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
      <div className="mt-2 flex flex-wrap gap-2 pl-14">
        {categories.map((c) => (
          <Chip key={c} active={runner.category === c} onClick={() => onChange({ category: c })}>
            {c}
          </Chip>
        ))}
      </div>
    </div>
  );
}
