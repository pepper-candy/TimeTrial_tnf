"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Chip, GoldBtn, Screen } from "@/components/shell";
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
      const data = await json<{ event: EventState }>("/api/demo", { method: "POST" });
      router.push(`/e/${data.event.code}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen className="px-5 pb-10 pt-16">
      <p className="text-center text-xs font-semibold uppercase tracking-[0.25em] text-gold">
        HKUST T&F
      </p>
      <h1 className="mt-3 text-center font-mono text-5xl font-semibold tracking-tight">
        Time Trial
      </h1>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="Join code"
        autoCapitalize="characters"
        autoCorrect="off"
        className="mt-10 h-16 w-full rounded-2xl bg-panel text-center font-mono text-3xl tracking-[0.3em] placeholder:tracking-normal"
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
