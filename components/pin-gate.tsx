"use client";

import { useEffect, useState } from "react";
import { NumberPad } from "@/components/pad";
import { Screen, TopBar } from "@/components/shell";
import { LoadingState } from "@/components/states";
import { getStoredPin, setStoredPin } from "@/lib/client/pin";

export function PinGate({
  code,
  children,
}: {
  code: string;
  children: React.ReactNode;
}) {
  const [ok, setOk] = useState(false);
  const [checking, setChecking] = useState(true);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const kick = window.setTimeout(() => {
      void (async () => {
        const stored = getStoredPin(code);
        if (stored) {
          const good = await tryPin(code, stored);
          if (!cancelled && good) {
            setOk(true);
            setChecking(false);
            return;
          }
        }
        const res = await fetch(`/api/events/${code}`, { cache: "no-store" });
        if (!cancelled && res.status === 404) {
          setChecking(false);
          return;
        }
        const data = (await res.json()) as { event?: { hasPin?: boolean } };
        if (!cancelled && data.event && data.event.hasPin === false) {
          setOk(true);
          setChecking(false);
          return;
        }
        if (!cancelled) setChecking(false);
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(kick);
    };
  }, [code]);

  async function submit(next = pin) {
    const good = await tryPin(code, next);
    if (good) {
      setStoredPin(code, next);
      setOk(true);
      setErr(false);
    } else {
      setErr(true);
    }
  }

  if (ok) return children;
  if (checking) {
    return (
      <Screen>
        <TopBar backHref={`/e/${code}`} title="PIN" />
        <LoadingState rows={4} />
      </Screen>
    );
  }

  return (
    <Screen>
      <TopBar backHref={`/e/${code}`} title="Helper PIN" />
      <div className="flex flex-1 flex-col px-4 pb-8">
        <p className="text-sm font-semibold text-dim">
          Timer, Marker, and Admin need the event PIN. Board is public — no PIN.
        </p>
        <div className="mt-6 mb-4 flex h-16 items-center justify-center rounded-2xl bg-panel font-mono text-5xl font-black tabular tracking-[0.35em] ring-1 ring-line">
          {pin ? "•".repeat(pin.length) : " "}
        </div>
        {err ? <p className="mb-3 text-center text-sm font-black text-stop">Wrong PIN</p> : null}
        <NumberPad value={pin} onChange={setPin} onEnter={() => void submit()} enterLabel="Unlock" />
      </div>
    </Screen>
  );
}

async function tryPin(code: string, pin: string): Promise<boolean> {
  if (!pin.trim()) return false;
  const res = await fetch(`/api/events/${code}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin }),
  });
  return res.ok;
}
