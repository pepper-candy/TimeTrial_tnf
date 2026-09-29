export const CATEGORIES = ["Boys", "Girls"] as const;
export type Category = (typeof CATEGORIES)[number];

/** WhatsApp paste order (coach format lists girls first). */
export const RESULTS_ORDER: readonly Category[] = ["Girls", "Boys"];

const ALIASES: Record<string, Category> = {
  boys: "Boys",
  boy: "Boys",
  b: "Boys",
  m: "Boys",
  male: "Boys",
  men: "Boys",
  man: "Boys",
  girls: "Girls",
  girl: "Girls",
  g: "Girls",
  f: "Girls",
  female: "Girls",
  women: "Girls",
  woman: "Girls",
};

/** Boys, Girls, or "" (no category — shown under All). Custom values migrate to "". */
export function normalizeCategory(value: unknown): Category | "" {
  if (typeof value !== "string") return "";
  return ALIASES[value.trim().toLowerCase()] ?? "";
}

export function inCategory(category: string, filter: "all" | Category): boolean {
  return filter === "all" || normalizeCategory(category) === filter;
}
