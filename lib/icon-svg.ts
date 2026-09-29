import { BOARD_BG, BOARD_DIM, BOARD_SAND, BRAND_BG, BRAND_TRACK, BRAND_WHITE } from "./brand";

export type IconVariant = "full" | "simple" | "maskable";

function n(v: number): number {
  return Math.round(v * 100) / 100;
}

function stadium(cx: number, cy: number, halfStraight: number, r: number): string {
  const left = n(cx - halfStraight);
  const right = n(cx + halfStraight);
  const top = n(cy - r);
  const bot = n(cy + r);
  const rr = n(r);
  return `M${left} ${top}H${right}A${rr} ${rr} 0 0 1 ${right} ${bot}H${left}A${rr} ${rr} 0 0 1 ${left} ${top}Z`;
}

function fullMark(cx: number, cy: number, scale: number): string {
  const s = scale;
  const x = (n: number) => cx + n * s;
  const y = (n: number) => cy + n * s;
  const outer = stadium(cx, cy, 6.2 * s, 8.2 * s);
  const inner = stadium(cx, cy, 6.2 * s, 5.4 * s);
  const finishY = cy - 8.2 * s;
  // Hand ~10° past 12 toward 1 — a just-ticked lap.
  const rad = ((-90 + 11) * Math.PI) / 180;
  const handLen = 11.2 * s;
  const hx = cx + Math.cos(rad) * handLen;
  const hy = cy + Math.sin(rad) * handLen;
  const tx = cx - Math.cos(rad) * 3.2 * s;
  const ty = cy - Math.sin(rad) * 3.2 * s;
  return `
    <circle cx="${cx}" cy="${cy}" r="${21.6 * s}" fill="#141414" stroke="${BRAND_TRACK}" stroke-width="${2.6 * s}"/>
    <circle cx="${cx}" cy="${cy}" r="${18.4 * s}" fill="${BRAND_BG}" stroke="${BRAND_WHITE}" stroke-width="${1.15 * s}"/>
    <path d="${outer}" fill="none" stroke="${BRAND_TRACK}" stroke-width="${1.7 * s}"/>
    <path d="${inner}" fill="none" stroke="${BRAND_TRACK}" stroke-width="${1.35 * s}"/>
    <line x1="${x(-3.2)}" y1="${finishY}" x2="${x(3.2)}" y2="${finishY}" stroke="${BRAND_WHITE}" stroke-width="${1.5 * s}" stroke-linecap="square"/>
    <line x1="${cx}" y1="${y(-18.4)}" x2="${cx}" y2="${y(-16.2)}" stroke="${BRAND_WHITE}" stroke-width="${1.6 * s}" stroke-linecap="round"/>
    <line x1="${tx}" y1="${ty}" x2="${hx}" y2="${hy}" stroke="${BRAND_TRACK}" stroke-width="${1.85 * s}" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="${2.15 * s}" fill="${BRAND_WHITE}"/>
    <circle cx="${cx}" cy="${cy}" r="${1.05 * s}" fill="${BRAND_TRACK}"/>
  `;
}

/** Chunky silhouette so a 16px favicon still reads as a stopwatch. */
function simpleMark(cx: number, cy: number, scale: number): string {
  const s = scale;
  const rad = ((-90 + 11) * Math.PI) / 180;
  const handLen = 9.6 * s;
  const hx = n(cx + Math.cos(rad) * handLen);
  const hy = n(cy + Math.sin(rad) * handLen);
  const bodyR = 21.2 * s;
  const knobW = 16 * s;
  const knobH = 9.2 * s;
  const knobY = n(cy - bodyR - 12.2 * s);
  const stemW = 8.4 * s;
  const stemH = 7 * s;
  return `
    <rect x="${n(cx - knobW / 2)}" y="${knobY}" width="${n(knobW)}" height="${n(knobH)}" rx="${n(2.6 * s)}" fill="${BRAND_TRACK}"/>
    <rect x="${n(cx - stemW / 2)}" y="${n(knobY + knobH - 2 * s)}" width="${n(stemW)}" height="${n(stemH)}" fill="${BRAND_TRACK}"/>
    <circle cx="${n(cx)}" cy="${n(cy)}" r="${n(bodyR)}" fill="${BRAND_TRACK}"/>
    <circle cx="${n(cx)}" cy="${n(cy)}" r="${n(14.6 * s)}" fill="${BRAND_BG}"/>
    <ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(9.8 * s)}" ry="${n(6.2 * s)}" fill="none" stroke="${BRAND_WHITE}" stroke-width="${n(2.8 * s)}"/>
    <line x1="${n(cx)}" y1="${n(cy)}" x2="${hx}" y2="${hy}" stroke="${BRAND_TRACK}" stroke-width="${n(3.2 * s)}" stroke-linecap="round"/>
    <circle cx="${n(cx)}" cy="${n(cy)}" r="${n(3.1 * s)}" fill="${BRAND_WHITE}"/>
  `;
}

function crownAndPushers(cx: number, watchCy: number, scale: number, detailed: boolean): string {
  const s = scale;
  const stemTop = watchCy - 21.6 * s;
  const knobW = detailed ? 12.4 * s : 14 * s;
  const knobH = detailed ? 6.4 * s : 7.2 * s;
  const knobY = stemTop - 8.4 * s;
  const stemW = 5.2 * s;
  const leftA = ((-90 - 48) * Math.PI) / 180;
  const rightA = ((-90 + 48) * Math.PI) / 180;
  const br = 21.6 * s;
  const pusher = (a: number) => {
    const px = cx + Math.cos(a) * (br + 1.1 * s);
    const py = watchCy + Math.sin(a) * (br + 1.1 * s);
    const deg = (a * 180) / Math.PI + 90;
    return `<rect x="${px - 2.1 * s}" y="${py - 3.4 * s}" width="${4.2 * s}" height="${6.8 * s}" rx="${1.3 * s}" fill="${BRAND_TRACK}" transform="rotate(${deg} ${px} ${py})"/>`;
  };
  const ridges = detailed
    ? `<line x1="${cx - 3.2 * s}" y1="${knobY + 2 * s}" x2="${cx - 3.2 * s}" y2="${knobY + knobH - 2 * s}" stroke="${BRAND_BG}" stroke-width="${0.9 * s}"/>
       <line x1="${cx}" y1="${knobY + 2 * s}" x2="${cx}" y2="${knobY + knobH - 2 * s}" stroke="${BRAND_BG}" stroke-width="${0.9 * s}"/>
       <line x1="${cx + 3.2 * s}" y1="${knobY + 2 * s}" x2="${cx + 3.2 * s}" y2="${knobY + knobH - 2 * s}" stroke="${BRAND_BG}" stroke-width="${0.9 * s}"/>`
    : "";
  const pushers = detailed ? `${pusher(leftA)}${pusher(rightA)}` : "";
  return `
    ${pushers}
    <rect x="${cx - stemW / 2}" y="${stemTop - 4.2 * s}" width="${stemW}" height="${6.2 * s}" rx="${0.8 * s}" fill="${BRAND_WHITE}"/>
    <rect x="${cx - knobW / 2}" y="${knobY}" width="${knobW}" height="${knobH}" rx="${1.8 * s}" fill="${BRAND_TRACK}"/>
    ${ridges}
  `;
}

/** 64×64 SVG — stopwatch whose face is a 400 m track oval. */
export function iconSvg(variant: IconVariant = "full"): string {
  const rounded = variant !== "maskable";
  const pad = variant === "maskable" ? 8 : 0;
  const inner = 64 - pad * 2;
  const scale = inner / 64;
  const ox = pad;
  const oy = pad;
  const cx = ox + 32 * scale;
  const watchCy = oy + (variant === "simple" ? 38 : 35.6) * scale;
  const rx = rounded ? 14 : 0;
  const detailed = variant === "full" || variant === "maskable";
  const face = detailed ? fullMark(cx, watchCy, scale) : simpleMark(cx, watchCy, scale);
  const chrome = detailed ? crownAndPushers(cx, watchCy, scale, true) : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" fill="none">
  <rect width="64" height="64" rx="${rx}" fill="${BRAND_BG}"/>
  ${chrome}
  ${face}
</svg>`;
}

export function ogSvg(opts: {
  headline: string;
  tagline: string;
  iconHref: string;
}): string {
  const { headline, tagline, iconHref } = opts;
  const splits = ["1:12.4", "2:28.1", "3:45.0", "5:01.8", "6:18.2"];
  const splitText = splits
    .map(
      (t, i) =>
        `<tspan dx="${i === 0 ? 0 : 36}" fill="${i === splits.length - 1 ? BRAND_TRACK : BOARD_DIM}">${escapeXml(t)}</tspan>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${BOARD_BG}"/>
  <rect x="0" y="0" width="8" height="630" fill="${BRAND_TRACK}"/>
  <image href="${iconHref}" x="72" y="115" width="400" height="400"/>
  <text x="520" y="268" font-family="Inter, 'Noto Sans', sans-serif" font-size="64" font-weight="800" fill="${BOARD_SAND}">${escapeXml(headline)}</text>
  <text x="520" y="328" font-family="Inter, 'Noto Sans', sans-serif" font-size="36" font-weight="600" fill="${BRAND_TRACK}">${escapeXml(tagline)}</text>
  <text x="520" y="510" font-family="'JetBrains Mono', 'Cascadia Mono', ui-monospace, monospace" font-size="28" font-weight="700" fill="${BOARD_DIM}">${splitText}</text>
  <rect x="520" y="544" width="560" height="8" rx="4" fill="#10131c"/>
  <rect x="520" y="544" width="560" height="8" rx="4" fill="url(#lane)"/>
  <defs>
    <pattern id="lane" width="28" height="8" patternUnits="userSpaceOnUse">
      <rect width="18" height="8" fill="${BOARD_BG}"/>
      <rect x="18" width="10" height="8" fill="${BRAND_TRACK}"/>
    </pattern>
  </defs>
</svg>`;
}

function escapeXml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
