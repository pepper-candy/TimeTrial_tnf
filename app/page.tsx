"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { rememberAdmin, setStoredPin } from "@/lib/client/pin";
import { json } from "@/lib/client/hooks";
import { normalizeCode } from "@/lib/ids";
import type { EventState } from "@/lib/types";

/** left %, length px, fall seconds, delay seconds (negative = already mid-fall), opacity. */
const LINES: [number, number, number, number, number][] = [
  [4, 220, 11, -2, 0.35],
  [11, 140, 8, -6, 0.5],
  [17, 300, 14, -9, 0.3],
  [24, 180, 9, -1, 0.45],
  [31, 260, 12, -7, 0.25],
  [38, 120, 7, -4, 0.4],
  [46, 240, 13, -11, 0.3],
  [53, 160, 9, -3, 0.5],
  [59, 320, 15, -8, 0.25],
  [66, 200, 10, -5, 0.45],
  [72, 140, 8, -2, 0.35],
  [79, 280, 13, -10, 0.3],
  [85, 180, 9, -6, 0.5],
  [91, 240, 12, -1, 0.35],
  [97, 150, 10, -7, 0.4],
];

const BTN =
  "launch tap flex h-16 w-full items-center justify-center rounded-[10px] px-4 text-lg font-black uppercase tracking-[0.14em] disabled:opacity-50";

export default function HomePage() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"join" | "demo" | null>(null);
  const [missing, setMissing] = useState(false);

  async function join() {
    const c = normalizeCode(code);
    if (c.length < 4) {
      input.current?.focus();
      if (c.length > 0) setMissing(true);
      return;
    }
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
    <main className="home-bg relative min-h-dvh overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {LINES.map(([left, h, dur, delay, op]) => (
          <span
            key={left}
            className="home-line"
            style={{
              left: `${left}%`,
              height: h,
              opacity: op,
              animationDuration: `${dur}s`,
              animationDelay: `${delay}s`,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-6 pt-[9dvh]">
        <header className="flex flex-col items-center text-center">
          <BrandMark className="h-14 w-14 drop-shadow-[0_0_18px_rgba(255,77,46,0.45)]" />
          <h1 className="home-title mt-4 font-display font-black uppercase italic leading-[0.85] text-accent">
            <span className="block text-[5.5rem] tracking-[0.04em]">TNF</span>
            <span className="block text-[2.4rem] tracking-[0.12em] text-sand">Time Trial</span>
          </h1>
        </header>

        <div className="mt-9 flex flex-col gap-3">
          <input
            ref={input}
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase().replace(/\s/g, ""));
              setMissing(false);
            }}
            placeholder="EVENT CODE"
            aria-label="Event code"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={8}
            className={`h-16 w-full rounded-[10px] bg-black/50 text-center font-mono text-3xl font-black uppercase tabular tracking-[0.3em] ring-2 backdrop-blur-sm placeholder:text-base placeholder:tracking-[0.2em] placeholder:text-dim/70 focus:outline-none ${
              missing ? "ring-stop" : "ring-line focus:ring-accent"
            }`}
            onKeyDown={(e) => e.key === "Enter" && join()}
          />
          <button
            type="button"
            onClick={join}
            disabled={busy === "join"}
            className={`${BTN} launch-solid bg-accent text-ink`}
          >
            {busy === "join" ? "…" : "Join event"}
          </button>
          {missing ? (
            <p className="-mt-1 text-center text-sm font-black text-stop">No event with that code</p>
          ) : null}
          <Link
            href="/create"
            className={`${BTN} launch-outline bg-bell/5 text-bell ring-2 ring-bell/80 active:bg-bell active:text-ink`}
          >
            Create event
          </Link>
          <button
            type="button"
            onClick={demo}
            disabled={busy === "demo"}
            className={`${BTN} launch-outline bg-sky/5 text-sky ring-2 ring-sky/70 active:bg-sky active:text-ink`}
          >
            {busy === "demo" ? "…" : "Watch demo"}
          </button>
        </div>

        <p className="mt-8 text-center font-mono text-xs font-bold uppercase tracking-[0.25em] text-dim/80">
          Tap · Mark · Watch live
        </p>

        <div className="flex-1" />
        <p className="text-center text-[10px] font-bold uppercase tracking-[0.35em] text-dim/50">
          HKUST Track &amp; Field
        </p>
      </div>
    </main>
  );
}
