"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { BigBtn, Screen, TopBar } from "@/components/shell";
import { EmptyState, LoadingState } from "@/components/states";
import { useEvent } from "@/lib/client/hooks";

const BTN =
  "launch tap flex min-h-36 w-full flex-1 items-center justify-center rounded-[10px] px-4 text-4xl font-black uppercase tracking-[0.14em]";

export default function HelperPage() {
  const { code } = useParams<{ code: string }>();
  const { event, error } = useEvent(code, 8000);

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
        <LoadingState rows={2} />
      </Screen>
    );
  }

  return (
    <Screen>
      <TopBar
        backHref="/"
        title={
          <div className="min-w-0 text-center leading-tight">
            <h1 className="truncate font-mono text-base font-black tracking-[0.16em]">{event.code}</h1>
            {event.name ? <p className="truncate text-xs font-bold text-dim">{event.name}</p> : null}
          </div>
        }
      />
      <div className="flex flex-1 flex-col gap-3 px-4 pb-8">
        <Link href={`/e/${code}/timer`} className={`${BTN} launch-solid bg-accent text-ink`}>
          Timer
        </Link>
        <Link
          href={`/e/${code}/marker`}
          className={`${BTN} launch-outline bg-sky/5 text-sky ring-2 ring-sky/70 active:bg-sky active:text-ink`}
        >
          Marker
        </Link>
      </div>
    </Screen>
  );
}
