"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BigBtn, Screen, TopBar } from "@/components/shell";
import { EmptyState, LoadingState } from "@/components/states";
import { useEvent } from "@/lib/client/hooks";
import { isAdminDevice } from "@/lib/client/pin";

const ROLES = [
  { href: "timer", label: "Timer", icon: "◉", hint: "Tap" },
  { href: "marker", label: "Marker", icon: "#", hint: "Bibs" },
  { href: "board", label: "Board", icon: "▦", hint: "Public" },
  { href: "admin", label: "Admin", icon: "⚙", hint: "Setup" },
] as const;

export default function RolePage() {
  const { code } = useParams<{ code: string }>();
  const { event, error } = useEvent(code, 4000);
  const [admin, setAdmin] = useState(false);

  useEffect(() => {
    const kick = window.setTimeout(() => setAdmin(isAdminDevice(code)), 0);
    return () => window.clearTimeout(kick);
  }, [code]);

  if (error === "missing") {
    return (
      <Screen>
        <TopBar backHref="/" title="Missing" />
        <EmptyState title="No event" hint="That code is missing or expired." />
        <div className="px-4 pb-8">
          <BigBtn href="/" tone="plain" className="w-full">
            Home
          </BigBtn>
        </div>
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
        info="Board is a public read-only link — no PIN. Timer, Marker and Admin unlock once per device with the helper PIN."
      />
      <p className="truncate px-4 text-center text-sm font-bold text-dim">{event.name}</p>
      <div className="grid flex-1 grid-cols-2 grid-rows-2 gap-3 p-4 pb-8">
        {ROLES.map((r) => {
          const hot = r.href === "admin" ? admin : false;
          return (
            <Link
              key={r.href}
              href={`/e/${code}/${r.href}`}
              className={`tap flex min-h-40 flex-col justify-between rounded-3xl p-5 ring-1 active:scale-[0.99] ${
                hot ? "bg-accent text-ink ring-accent" : "bg-panel ring-line"
              }`}
            >
              <span className={`text-4xl font-black ${hot ? "text-ink" : "text-accent"}`}>{r.icon}</span>
              <span>
                <span className="block text-3xl font-black tracking-tight sm:text-4xl">{r.label}</span>
                <span className={`text-xs font-bold uppercase tracking-wider ${hot ? "text-ink/70" : "text-dim"}`}>
                  {hot ? "Yours" : r.hint}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </Screen>
  );
}
