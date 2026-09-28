"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { Chip, HelpTip, Screen, TopBar } from "@/components/shell";
import { PinGate } from "@/components/pin-gate";
import { EmptyState, LoadingState } from "@/components/states";
import { fetchWithPin, useEvent } from "@/lib/client/hooks";
import { formatClock, formatPace } from "@/lib/format";
import { formatResultsText, type ResultsStyle } from "@/lib/results";

export default function StatsPage() {
  const { code } = useParams<{ code: string }>();
  return (
    <PinGate code={code}>
      <StatsInner code={code} />
    </PinGate>
  );
}

function StatsInner({ code }: { code: string }) {
  const { event, races, stats } = useEvent(code, 2000);
  const [copied, setCopied] = useState(false);
  const [style, setStyle] = useState<ResultsStyle>("summary");

  if (!event) {
    return (
      <Screen>
        <TopBar backHref={`/e/${code}/board`} title="Stats" />
        <LoadingState />
      </Screen>
    );
  }

  const live = event;

  async function copyResults() {
    const text = formatResultsText(live, races, style);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  async function downloadCsv() {
    const res = await fetchWithPin(`/api/events/${code}/export`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${live.code}-results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Screen className="max-w-6xl">
      <TopBar
        backHref={`/e/${code}/board`}
        title="Stats"
        right={<HelpTip text="Summary is the coach WhatsApp paste. Detailed adds every km ( ~ = estimated ), fast/slow lap, half-split, and consistency." />}
      />
      <div className="flex flex-wrap gap-2 px-3 pb-2">
        <Chip active={style === "summary"} onClick={() => setStyle("summary")}>
          Summary
        </Chip>
        <Chip active={style === "detailed"} onClick={() => setStyle("detailed")}>
          Detailed
        </Chip>
        <button
          type="button"
          className="tap rounded-full bg-gold px-3.5 py-2 text-sm font-black text-ink"
          onClick={() => void copyResults()}
        >
          {copied ? "Copied" : "Copy results"}
        </button>
        <button
          type="button"
          className="tap rounded-full bg-panel2 px-3.5 py-2 text-sm font-semibold ring-1 ring-line"
          onClick={() => void downloadCsv()}
        >
          Export CSV
        </button>
      </div>
      <div className="flex-1 overflow-auto px-3 pb-8">
        {races.length === 0 ? (
          <EmptyState title="No results yet" hint="Times land here after the first crossing." />
        ) : (
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-[11px] font-black uppercase tracking-wider text-dim">
              <tr>
                <th className="py-2 pr-2">#</th>
                <th className="pr-2">Bib</th>
                <th className="pr-2">Name</th>
                <th className="pr-2">Cat</th>
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
                  <tr
                    key={r.runner.id}
                    className={`border-t border-line ${i === 0 ? "p1-row" : ""}`}
                  >
                    <td
                      className={`py-2 pr-2 font-mono text-xs font-black tabular ${
                        i === 0 ? "text-gold" : "text-dim"
                      }`}
                    >
                      {i + 1}
                    </td>
                    <td className="pr-2 font-mono text-lg font-black tabular">{r.runner.bib}</td>
                    <td className="pr-2 font-bold">{r.runner.name}</td>
                    <td className="pr-2 text-xs font-bold uppercase tracking-wide text-gold">
                      {r.runner.category}
                    </td>
                    <td className="pr-2 font-mono text-xs tabular text-dim">{r.runner.studentId}</td>
                    <td className="pr-2 font-mono font-black tabular">
                      {r.finishMs != null ? formatClock(r.finishMs, 2) : r.crossings.length}
                    </td>
                    <td className="pr-2 font-mono font-black tabular">
                      {formatPace(s.avgPaceSecPerKm ?? 0)}
                    </td>
                    <td className="pr-2 font-mono font-black tabular text-gold">
                      {formatPace(s.lastLapPaceSecPerKm ?? 0)}
                    </td>
                    <td className="pr-2 font-mono font-black tabular">
                      {formatPace(s.fastestLapPaceSecPerKm ?? 0)}
                    </td>
                    <td className="pr-2 font-mono font-black tabular">
                      {s.speedKmh?.toFixed(1) ?? "—"}
                    </td>
                    <td className="font-mono font-black tabular">
                      {s.gapToLeaderMs == null ? "—" : formatClock(Math.abs(s.gapToLeaderMs), 1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </Screen>
  );
}
