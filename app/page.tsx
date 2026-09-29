"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
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
        <header className="home-lockup">
          <h1 className="home-title flex items-baseline justify-center gap-[0.16em] font-display font-black uppercase italic leading-none whitespace-nowrap">
            <span className="tracking-[0.04em] text-accent">TNF</span>
            <span className="text-[0.44em] tracking-[0.12em] text-sand">Time Trial</span>
          </h1>
        </header>

        <div className="mt-9 flex flex-col gap-3">
          <label
            className={`home-code-field w-full rounded-[10px] ring-2 focus-within:outline-none ${
              missing ? "ring-stop" : "ring-line focus-within:ring-accent"
            }`}
          >
            <span className="home-code-prefix">EVENT CODE:</span>
            <span className="home-code-slot">
              <input
                ref={input}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase().replace(/\s/g, ""));
                  setMissing(false);
                }}
                placeholder=" "
                aria-label="Event code"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                maxLength={8}
                className="home-code focus:outline-none"
                onKeyDown={(e) => e.key === "Enter" && join()}
              />
              <span aria-hidden className="home-caret" />
            </span>
          </label>
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
