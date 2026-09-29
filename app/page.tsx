"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { BigBtn, Screen } from "@/components/shell";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { adminEvents, rememberAdmin, setStoredPin, type AdminEvent } from "@/lib/client/pin";
import { json } from "@/lib/client/hooks";
import { normalizeCode } from "@/lib/ids";
import type { EventState } from "@/lib/types";

export default function HomePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"join" | "demo" | null>(null);
  const [missing, setMissing] = useState(false);
  const [mine, setMine] = useState<AdminEvent[]>([]);

  useEffect(() => {
    const kick = window.setTimeout(() => setMine(adminEvents().slice(0, 4)), 0);
    return () => window.clearTimeout(kick);
  }, []);

  async function join() {
    const c = normalizeCode(code);
    if (c.length < 4) return;
    setBusy("join");
    try {
      const res = await fetch(`/api/events/${c}?head=1`, { cache: "no-store" });
      if (!res.ok) {
        setMissing(true);
        return;
      }
      router.push(`/e/${c}`);
    } finally {
      setBusy(null);
    }
  }

  async function demo() {
    setBusy("demo");
    try {
      const data = await json<{ event: EventState; pin?: string }>("/api/demo", { method: "POST" });
      setStoredPin(data.event.code, data.pin || "1234");
      rememberAdmin(data.event.code, data.event.name);
      router.push(`/e/${data.event.code}/board`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen className="px-5 pb-8 pt-10">
      <div className="lane-stripe rounded-full" />
      <div className="mt-6 flex items-center justify-center gap-4">
        <BrandMark className="h-16 w-16 shrink-0" />
        <div>
          <h1 className="font-mono text-3xl font-black tabular tracking-tight sm:text-4xl">{APP_NAME}</h1>
          <p className="text-xs font-bold uppercase tracking-widest text-dim">{APP_TAGLINE}</p>
        </div>
      </div>

      <div className="mt-8 flex gap-2">
        <input
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setMissing(false);
          }}
          placeholder="Event code"
          aria-label="Event code"
          autoCapitalize="characters"
          autoCorrect="off"
          className={`h-16 min-w-0 flex-1 rounded-2xl bg-panel text-center font-mono text-3xl font-black tabular tracking-[0.3em] ring-1 placeholder:text-lg placeholder:font-semibold placeholder:tracking-normal placeholder:text-dim ${
            missing ? "ring-stop" : "ring-line"
          }`}
          onKeyDown={(e) => e.key === "Enter" && join()}
        />
        <BigBtn className="w-28" onClick={join} disabled={busy === "join" || code.trim().length < 4}>
          {busy === "join" ? "…" : "Join"}
        </BigBtn>
      </div>
      {missing ? <p className="mt-2 text-center text-sm font-black text-stop">No event with that code</p> : null}

      <div className="mt-3 grid grid-cols-2 gap-3">
        <BigBtn tone="plain" href="/create">
          New event
        </BigBtn>
        <BigBtn tone="plain" onClick={demo} disabled={busy === "demo"}>
          {busy === "demo" ? "…" : "Demo"}
        </BigBtn>
      </div>

      {mine.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-2 text-[11px] font-black uppercase tracking-[0.16em] text-dim">My events</h2>
          <div className="grid grid-cols-2 gap-3">
            {mine.map((e) => (
              <Link
                key={e.code}
                href={`/e/${e.code}/admin`}
                className="tap rounded-2xl bg-panel px-4 py-3 ring-1 ring-line active:bg-sand active:text-ink"
              >
                <div className="font-mono text-2xl font-black tabular tracking-[0.12em]">{e.code}</div>
                <div className="truncate text-xs font-bold text-dim">{e.name}</div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </Screen>
  );
}
