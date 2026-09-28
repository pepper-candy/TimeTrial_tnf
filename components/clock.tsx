"use client";

import { formatClock } from "@/lib/format";

export function RaceClock({
  startedAt,
  now,
  className = "",
}: {
  startedAt: number | null;
  now: number;
  className?: string;
}) {
  const ms = startedAt != null ? Math.max(0, now - startedAt) : 0;
  return (
    <div className={`font-mono font-semibold tabular leading-none ${className}`}>
      {startedAt != null ? formatClock(ms) : "0:00.0"}
    </div>
  );
}
