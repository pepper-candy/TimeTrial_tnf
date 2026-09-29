export function formatEst(text: string, estimated?: boolean): string {
  if (!estimated || text.startsWith("~")) return text;
  return `~${text}`;
}

export function formatClock(ms: number, digits = 1): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const frac = Math.floor(ms / Math.pow(10, 3 - digits)) % Math.pow(10, digits);
  const s = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const m = totalMin % 60;
  const h = Math.floor(totalMin / 60);
  const ss = String(s).padStart(2, "0");
  const f = String(frac).padStart(digits, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}.${f}`;
  return `${m}:${ss}.${f}`;
}

export function formatPace(secPerKm: number): string {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0 || secPerKm > 3600) return "—";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  if (s === 60) return `${m + 1}:00`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Club WhatsApp time: 28'15 */
export function formatClubMs(ms: number): string {
  return formatClubSec(Math.round(ms / 1000));
}

export function formatClubPace(secPerKm: number): string {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return "—";
  return formatClubSec(Math.round(secPerKm));
}

export function formatClubSec(totalSec: number): string {
  if (!Number.isFinite(totalSec) || totalSec < 0) totalSec = 0;
  const s = Math.round(totalSec);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}'${String(rem).padStart(2, "0")}`;
}

/** Signed delta for positive/negative split: +11, -0'19, 0 */
export function formatSplitDelta(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec === 0) return "0";
  const sign = sec > 0 ? "+" : "-";
  const abs = Math.abs(sec);
  if (abs < 60) return `${sign}${abs}`;
  return `${sign}${formatClubSec(abs)}`;
}

export function parseClubTime(text: string): number | null {
  const t = text.trim();
  const m = t.match(/^(\d+)'(\d{2})$/);
  if (!m) return null;
  const sec = Number(m[2]);
  if (sec >= 60) return null;
  return (Number(m[1]) * 60 + sec) * 1000;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function formatEventDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function parsePace(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const m = t.match(/^(\d+):(\d{1,2})(?:\.(\d+))?$/);
  if (!m) return null;
  const min = Number(m[1]);
  const sec = Number(m[2]);
  if (sec >= 60) return null;
  return min * 60 + sec;
}

export function formatSpeed(kmh: number): string {
  if (!Number.isFinite(kmh) || kmh <= 0) return "—";
  return kmh.toFixed(1);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function bibColor(bib: string): string {
  let h = 0;
  for (let i = 0; i < bib.length; i++) h = (h * 31 + bib.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 70% 42%)`;
}
