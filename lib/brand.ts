/** Single source of truth for product name, titles, and chrome colours. */

export const APP_NAME = "TNF Time Trial";
export const APP_SHORT_NAME = "TNF Time Trial";
export const APP_TAGLINE = "Live lap timing";
export const APP_DEFAULT_TITLE = "TNF Time Trial · Live Lap Timing";
export const APP_TITLE_TEMPLATE = "%s · TNF Time Trial";
export const APP_DESCRIPTION =
  "Live lap timing for track time trials. One helper taps, one enters bibs, and everyone watches splits, paces and rankings update in real time.";

export const BRAND_BG = "#0A0A0A";
export const BRAND_TRACK = "#FF4D2E";
export const BRAND_WHITE = "#FFFFFF";
/** Board / scoreboard void — OG card matches this. */
export const BOARD_BG = "#05060a";
export const BOARD_SAND = "#fff8ec";
export const BOARD_DIM = "#c4cce0";

export const THEME_COLOR = BRAND_BG;

export function siteUrl(): string {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}

export function documentTitle(page: string): string {
  return APP_TITLE_TEMPLATE.replace("%s", page);
}

/** Public Board share preview — event name only, never runner PII. */
export function boardDocumentTitle(eventName: string): string {
  const name = eventName.trim() || "Time trial";
  return `${name} · Live Board`;
}

/** OG/Twitter headline for a public board — event name, never runners. */
export function boardShareHeadline(eventName: string | null | undefined): string {
  const name = eventName?.trim();
  return name || APP_NAME;
}
