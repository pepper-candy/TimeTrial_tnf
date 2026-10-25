"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { BigBtn, Screen, TopBar } from "@/components/shell";
import { EmptyState, LoadingState } from "@/components/states";
import { useEvent } from "@/lib/client/hooks";
import { SPRINT_COMPLETE_FLOW_URL } from "@/lib/share";

const BTN =
  "launch tap flex h-full min-h-0 w-full flex-1 items-center justify-center rounded-[10px] px-4 text-3xl font-black uppercase tracking-[0.14em] sm:text-4xl";

const SPRINT_FLOW_INFO = (
  <>
    Race day: Admin creates lanes and shares links; Starter arms and bangs the gun (server
    clock); Finish Cam records, marks, and Accepts finishes; Board shows live lane times. Full
    flow:{" "}
    <a
      href={SPRINT_COMPLETE_FLOW_URL}
      target="_blank"
      rel="noreferrer"
      className="font-bold text-sky underline underline-offset-2"
    >
      SPRINT-COMPLETE-FLOW.md
    </a>
    .
  </>
);

export default function HelperPage() {
  const { code } = useParams<{ code: string }>();
  const { event, error } = useEvent(code, 8000);

  if (error === "missing") {
    return (
      <Screen>
        <TopBar backHref="/" title="Missing" />
        <EmptyState title="No event" hint="That code is missing or expired." />
        <div className="px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
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
        <TopBar backHref={`/e/${code}`} title={code} />
        <LoadingState rows={2} />
      </Screen>
    );
  }

  const sprint = event.kind === "sprint";

  return (
    <Screen>
      <TopBar
        backHref={`/e/${code}`}
        title={
          <div className="min-w-0 text-center leading-tight">
            <h1 className="truncate font-mono text-base font-black tracking-[0.16em]">{event.code}</h1>
            {event.name ? <p className="truncate text-xs font-bold text-dim">{event.name}</p> : null}
          </div>
        }
        info={sprint ? SPRINT_FLOW_INFO : undefined}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {sprint ? (
          <>
            <Link href={`/e/${code}/starter`} className={`${BTN} launch-solid bg-accent text-ink`}>
              Starter
            </Link>
            <Link
              href={`/e/${code}/finish-cam`}
              className={`${BTN} launch-outline bg-sky/5 text-sky ring-2 ring-sky/70 active:bg-sky active:text-ink`}
            >
              Finish Cam
            </Link>
          </>
        ) : (
          <>
            <Link href={`/e/${code}/timer`} className={`${BTN} launch-solid bg-accent text-ink`}>
              Timer
            </Link>
            <Link
              href={`/e/${code}/marker`}
              className={`${BTN} launch-outline bg-sky/5 text-sky ring-2 ring-sky/70 active:bg-sky active:text-ink`}
            >
              Marker
            </Link>
          </>
        )}
      </div>
    </Screen>
  );
}
