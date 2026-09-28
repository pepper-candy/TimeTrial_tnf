"use client";

import { useParams } from "next/navigation";
import { HelpTip, Screen, TopBar } from "@/components/shell";
import { useEvent } from "@/lib/client/hooks";
import { formatClock, formatPace } from "@/lib/format";

export default function StatsPage() {
  const { code } = useParams<{ code: string }>();
  const { event, races, stats } = useEvent(code, 2000);

  if (!event) {
    return (
      <Screen>
        <TopBar backHref={`/e/${code}/board`} title="Stats" />
      </Screen>
    );
  }

  return (
    <Screen className="max-w-6xl">
      <TopBar
        backHref={`/e/${code}/board`}
        title="Stats"
        right={<HelpTip text="Per-runner summary. CSV exports splits after the race." />}
      />
      <div className="px-3 pb-2">
        <a
          href={`/api/events/${code}/export`}
          className="tap inline-block rounded-full bg-gold px-3.5 py-2 text-sm font-semibold text-ink"
        >
          Export CSV
        </a>
      </div>
      <div className="flex-1 overflow-auto px-3 pb-8">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-dim">
            <tr>
              <th className="py-2 pr-2">#</th>
              <th className="pr-2">Bib</th>
              <th className="pr-2">Name</th>
              <th className="pr-2">SID</th>
              <th className="pr-2">Fin</th>
              <th className="pr-2">Avg</th>
              <th className="pr-2">Last</th>
              <th className="pr-2">Best</th>
              <th className="pr-2">km/h</th>
              <th>Gap</th>
            </tr>
          </thead>
          <tbody>
            {races.map((r, i) => {
              const s = stats[i];
              return (
                <tr key={r.runner.id} className="border-t border-line">
                  <td className="py-2 pr-2 font-mono text-dim">{i + 1}</td>
                  <td className="pr-2 font-mono text-lg font-bold">{r.runner.bib}</td>
                  <td className="pr-2">{r.runner.name}</td>
                  <td className="pr-2 font-mono text-xs text-dim">{r.runner.studentId}</td>
                  <td className="pr-2 font-mono">
                    {r.finishMs != null ? formatClock(r.finishMs, 2) : r.crossings.length}
                  </td>
                  <td className="pr-2 font-mono">{formatPace(s.avgPaceSecPerKm ?? 0)}</td>
                  <td className="pr-2 font-mono">{formatPace(s.lastLapPaceSecPerKm ?? 0)}</td>
                  <td className="pr-2 font-mono">{formatPace(s.fastestLapPaceSecPerKm ?? 0)}</td>
                  <td className="pr-2 font-mono">{s.speedKmh?.toFixed(1) ?? "—"}</td>
                  <td className="font-mono">
                    {s.gapToLeaderMs == null ? "—" : formatClock(Math.abs(s.gapToLeaderMs), 1)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Screen>
  );
}
