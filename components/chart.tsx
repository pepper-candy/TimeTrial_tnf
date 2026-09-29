"use client";

import { splitDistance } from "@/lib/course";
import { formatPace } from "@/lib/format";
import type { EventState } from "@/lib/types";
import type { RunnerRace } from "@/lib/race";

export function PaceChart({
  event,
  race,
}: {
  event: EventState;
  race: RunnerRace;
}) {
  if (race.splitMs.length === 0) {
    return <div className="h-24 rounded-xl bg-panel2" />;
  }
  const paces = race.splitMs.map((ms, i) => {
    const d = splitDistance(event.course, i + 1);
    return d > 0 ? ms / 1000 / (d / 1000) : 0;
  });
  const min = Math.min(...paces);
  const max = Math.max(...paces);
  const span = Math.max(1, max - min);
  const showPace = paces.length <= 8;
  return (
    <div className="flex h-28 items-end gap-1">
      {paces.map((p, i) => {
        const faster = (max - p) / span;
        const h = 18 + faster * 72;
        const full = Math.abs(splitDistance(event.course, i + 1) - event.course.lapLengthM) < 0.5;
        return (
          <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
            <div
              className={`w-full rounded-t-md ${
                i === paces.length - 1 ? "bg-bell" : full ? "bg-accent" : "bg-sky"
              }`}
              style={{ height: h }}
              title={formatPace(p)}
            />
            <div className="font-mono text-[10px] font-bold tabular text-dim">{i + 1}</div>
            {showPace ? (
              <div className="font-mono text-[9px] font-black tabular text-accent">{formatPace(p)}</div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
