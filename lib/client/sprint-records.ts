/** Write one sprint finish per lane via existing taps/marks store (sprint-finish action). */

import { json } from "@/lib/client/hooks";
import type { EventState } from "@/lib/types";

export async function acceptSprintFinish(
  code: string,
  bib: string,
  /** Absolute tap epoch (startedAt + finishMs). */
  tapT: number,
  actor: "timer" | "marker" | "admin" = "timer",
): Promise<EventState> {
  const data = await json<{ event: EventState }>(`/api/events/${code}/taps`, {
    method: "POST",
    body: JSON.stringify({
      action: "sprint-finish",
      bib,
      t: Math.round(tapT),
      actor,
    }),
  });
  return data.event;
}

export async function acceptSprintFinishes(
  code: string,
  rows: { bib: string; tapT: number }[],
  actor: "timer" | "marker" | "admin" = "timer",
): Promise<EventState | null> {
  let last: EventState | null = null;
  for (const row of rows) {
    if (!Number.isFinite(row.tapT)) continue;
    last = await acceptSprintFinish(code, row.bib, row.tapT, actor);
  }
  return last;
}
