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
    <div className={`clock font-mono font-black tabular leading-none tracking-tight ${className}`}>
      {startedAt != null ? formatClock(ms) : "0:00.0"}
    </div>
  );
}
