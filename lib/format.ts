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

export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 10);
  return `${parts[0].slice(0, 8)}`;
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
