import { kmCrossings } from "./course";
import { formatClubMs, formatClubPace, formatEventDate, formatSplitDelta } from "./format";
import { buildRunnerRaces, compareRank, type RunnerRace } from "./race";
import {
  fastestSlowestLap,
  fullLapsFor,
  halfSplitFor,
  kmMarksFor,
} from "./stats";
import type { CourseConfig, EventState } from "./types";

export type ResultsStyle = "summary" | "detailed";

export function defaultResultKmSplits(course: CourseConfig): number[] {
  const kms = kmCrossings(course)
    .map((x) => x.km)
    .filter((km) => km * 1000 < course.totalDistanceM - 0.5);
  const preferred = [1, 3].filter((k) => kms.includes(k));
  return preferred.length > 0 ? preferred : kms.slice(0, 2);
}

export function rankEmoji(place: number): string {
  if (place === 10) return "🔟";
  const keys = ["0️⃣", "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];
  return String(Math.max(1, Math.round(place)))
    .split("")
    .map((d) => keys[Number(d)] ?? d)
    .join("");
}

export function lapsCompleted(event: EventState, race: RunnerRace): number {
  const last = race.crossings[race.crossings.length - 1];
  if (!last) return 0;
  return last.distanceM / event.course.lapLengthM;
}

export function formatLapsShort(laps: number): string {
  const rounded = Math.round(laps * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function kmSplitElapsed(
  event: EventState,
  race: RunnerRace,
  km: number,
): number | null {
  const hit = kmCrossings(event.course).find((x) => x.km === km);
  if (!hit) return null;
  const crossing = race.crossings[hit.index - 1];
  if (!crossing || event.startedAt == null) return null;
  return crossing.t - event.startedAt;
}

export function formatResultsText(
  event: EventState,
  races?: RunnerRace[],
  style: ResultsStyle = "summary",
): string {
  const all = (races ?? buildRunnerRaces(event)).filter((r) => r.crossings.length > 0);
  const date = formatEventDate(event.startedAt ?? event.createdAt);
  const lines = [`*${event.name} on ${date}*`];
  if (style === "detailed") lines.push("_Detailed_");
  lines.push("");

  const order = categoryOrder(event);
  const kms = (event.resultKmSplits?.length
    ? event.resultKmSplits
    : defaultResultKmSplits(event.course)
  ).filter((km) => kmCrossings(event.course).some((x) => x.km === km));

  const fallback = order[0] ?? "Boys";
  for (const cat of order) {
    const group = all
      .filter((r) => runnerCategory(r.runner.category, fallback) === cat)
      .sort(compareRank);
    if (group.length === 0) continue;
    lines.push(`*${cat}:*`);
    group.forEach((race, i) => {
      const block =
        style === "detailed"
          ? formatDetailedRunner(event, race, i + 1)
          : formatSummaryRunner(event, race, i + 1, kms);
      lines.push(block);
      lines.push("");
    });
  }

  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n") + "\n";
}

function formatSummaryRunner(
  event: EventState,
  race: RunnerRace,
  place: number,
  kms: number[],
): string {
  const r = race.runner;
  const last = race.crossings[race.crossings.length - 1];
  const elapsed = last && event.startedAt != null ? last.t - event.startedAt : 0;
  const distM = last?.distanceM ?? 0;
  const dnf = !race.finished;
  const time = formatClubMs(elapsed);
  const lapsBit = dnf ? ` (${formatLapsShort(lapsCompleted(event, race))} laps)` : "";

  const parts: string[] = [];
  for (const km of kms) {
    const ms = kmSplitElapsed(event, race, km);
    if (ms == null) continue;
    parts.push(`${km}K: ${formatClubMs(ms)}`);
  }
  const splitsBit = parts.length ? ` (${parts.join("; ")})` : "";
  const avgSec = distM > 0 ? elapsed / 1000 / (distM / 1000) : 0;

  return [
    `${rankEmoji(place)}Bib No.${r.bib} (${r.studentId})`,
    `Result: ${time}${lapsBit}${splitsBit}`,
    `Avg.: ${formatClubPace(avgSec)}/K`,
  ].join("\n");
}

function formatDetailedRunner(event: EventState, race: RunnerRace, place: number): string {
  const r = race.runner;
  const last = race.crossings[race.crossings.length - 1];
  const elapsed = last && event.startedAt != null ? last.t - event.startedAt : 0;
  const distM = last?.distanceM ?? 0;
  const dnf = !race.finished;
  const time = formatClubMs(elapsed);
  const lapsBit = dnf ? ` (${formatLapsShort(lapsCompleted(event, race))} laps)` : "";
  const avgSec = distM > 0 ? elapsed / 1000 / (distM / 1000) : 0;

  const lines = [
    `${rankEmoji(place)}*Bib No.${r.bib}* (${r.studentId})`,
    `*${time}*${lapsBit} · Avg ${formatClubPace(avgSec)}/K`,
  ];

  const kms = kmMarksFor(event, race);
  if (kms.length > 0) {
    lines.push(
      kms
        .map((k) => `${k.km}K ${k.exact ? "" : "~"}${formatClubMs(k.elapsedMs)}`)
        .join(" · "),
    );
  }

  const bits: string[] = [];
  const pair = fastestSlowestLap(fullLapsFor(event, race));
  if (pair) {
    bits.push(`Fast L${pair.fast.lap} ${formatClubMs(pair.fast.ms)}`);
    bits.push(`Slow L${pair.slow.lap} ${formatClubMs(pair.slow.ms)}`);
  }
  const half = halfSplitFor(event, race);
  if (half) {
    bits.push(
      `Half ${formatClubMs(half.firstMs)}/${formatClubMs(half.secondMs)} (${formatSplitDelta(half.deltaMs)})`,
    );
  }
  const laps = fullLapsFor(event, race);
  if (laps.length >= 2) {
    const mean = laps.reduce((s, x) => s + x.ms, 0) / laps.length;
    const variance = laps.reduce((s, x) => s + (x.ms - mean) ** 2, 0) / laps.length;
    const pct = mean > 0 ? (Math.sqrt(variance) / mean) * 100 : 0;
    const shown = Math.round(pct * 10) / 10;
    bits.push(`Cons ${Number.isInteger(shown) ? String(shown) : shown.toFixed(1)}%`);
  }
  if (bits.length) lines.push(bits.join(" · "));
  return lines.join("\n");
}

export function runnerCategory(category: string | undefined, fallback: string): string {
  const name = (category ?? "").trim();
  return name || fallback;
}

export function categoryOrder(event: EventState): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of event.categories ?? []) {
    const name = c.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  for (const r of event.runners) {
    const name = (r.category || "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}
