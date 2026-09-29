"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { HelpTip, Screen, TopBar } from "@/components/shell";
import { EmptyState, LoadingState } from "@/components/states";
import { useEvent } from "@/lib/client/hooks";

const ROLES = [
  { href: "timer", label: "Timer", hint: "PIN" },
  { href: "marker", label: "Marker", hint: "PIN" },
  { href: "board", label: "Board", hint: "Public" },
  { href: "admin", label: "Admin", hint: "PIN" },
] as const;

export default function RolePage() {
  const { code } = useParams<{ code: string }>();
  const { event, error } = useEvent(code, 4000);

  if (error === "missing") {
    return (
      <Screen>
        <EmptyState title="No event" hint="That join code is missing or expired." />
        <Link href="/" className="mb-10 text-center text-gold font-bold">
          Home
        </Link>
      </Screen>
    );
  }

  if (!event) {
    return (
      <Screen>
        <TopBar backHref="/" title={code} />
        <LoadingState rows={4} />
      </Screen>
    );
  }

  return (
    <Screen>
      <TopBar
        backHref="/"
        title={event.code}
        right={
          <HelpTip text="Board is a public read-only link — no PIN. Timer, Marker, and Admin unlock once per device with the helper PIN." />
        }
      />
      <div className="grid flex-1 grid-cols-2 gap-3 p-4 pb-8">
        {ROLES.map((r) => (
          <Link
            key={r.href}
            href={`/e/${code}/${r.href}`}
            className="tap flex flex-col justify-between rounded-3xl bg-panel p-5 min-h-40 ring-1 ring-line"
          >
            <span className="text-xs font-bold uppercase tracking-wider text-gold">
              {r.hint}
            </span>
            <span className="text-3xl font-black tracking-tight">{r.label}</span>
          </Link>
        ))}
      </div>
    </Screen>
  );
}
