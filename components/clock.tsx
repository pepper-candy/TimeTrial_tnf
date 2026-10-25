"use client";

import { formatClock } from "@/lib/format";

export function RaceClock({
  startedAt,
  now,
  digits = 1,
  className = "",
}: {
  startedAt: number | null;
  now: number;
  /** Fractional digits after the seconds (sprint uses 2). */
  digits?: number;
  className?: string;
}) {
  const ms = startedAt != null ? Math.max(0, now - startedAt) : 0;
  const idle = `0:00.${"0".repeat(Math.max(0, digits))}`;
  return (
    <div className={`clock font-mono font-black tabular leading-none tracking-tight ${className}`}>
      {startedAt != null ? formatClock(ms, digits) : idle}
    </div>
  );
}
