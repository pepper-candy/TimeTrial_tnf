"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { Chip, GoldBtn, Screen } from "@/components/shell";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { setStoredPin } from "@/lib/client/pin";
import { json } from "@/lib/client/hooks";
import { normalizeCode } from "@/lib/ids";
import type { EventState } from "@/lib/types";

export default function HomePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"join" | "demo" | null>(null);

  async function join() {
    const c = normalizeCode(code);
    if (c.length < 4) return;
    setBusy("join");
    try {
      const res = await fetch(`/api/events/${c}?head=1`, { cache: "no-store" });
      if (!res.ok) {
        setBusy(null);
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
      router.push(`/e/${data.event.code}/board`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen className="px-5 pb-10 pt-14">
      <div className="lane-stripe rounded-full" />
      <BrandMark className="mx-auto mt-8 h-20 w-20" />
      <h1 className="mt-5 text-center font-mono text-4xl font-black tabular tracking-tight sm:text-5xl">
        {APP_NAME}
      </h1>
      <p className="mt-3 text-center text-sm font-semibold uppercase tracking-widest text-dim">
        {APP_TAGLINE} · Timer · Marker · Board
      </p>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="Join code"
        autoCapitalize="characters"
        autoCorrect="off"
        className="mt-10 h-16 w-full rounded-2xl bg-panel text-center font-mono text-3xl font-black tabular tracking-[0.3em] placeholder:tracking-normal ring-1 ring-line"
        onKeyDown={(e) => e.key === "Enter" && join()}
      />
      <GoldBtn className="mt-3" onClick={join} disabled={busy === "join" || code.trim().length < 4}>
        Join
      </GoldBtn>
      <div className="mt-8 flex justify-center gap-2">
        <Chip onClick={() => router.push("/create")}>Create</Chip>
        <Chip onClick={demo}>{busy === "demo" ? "…" : "Demo race"}</Chip>
      </div>
    </Screen>
  );
}
