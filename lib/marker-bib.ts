/** How many digits a bib takes, from the longest roster bib. At least 1, at most 8. */
export function bibDigitWidth(bibs: readonly string[]): number {
  let width = 1;
  for (const bib of bibs) {
    const n = String(bib).replace(/\D/g, "").length;
    if (n > width) width = n;
  }
  return Math.min(width, 8);
}

/** Zero-pad a bib for the Marker display. Longer bibs are left as typed. */
export function padBib(bib: string, width: number): string {
  const digits = String(bib).replace(/\D/g, "");
  if (!digits) return String(bib);
  return digits.padStart(Math.max(1, width), "0");
}

/** Typed digits plus underscores for the slots still open, e.g. "0_". */
export function bibPrompt(typed: string, width: number): string {
  const w = Math.max(1, width);
  const digits = typed.replace(/\D/g, "").slice(0, w);
  return digits + "_".repeat(w - digits.length);
}

/**
 * One pad key. A digit that fills the width submits the zero-padded bib and
 * clears the buffer. Backspace and clear never submit.
 */
export function applyBibKey(
  typed: string,
  key: string,
  width: number,
): { typed: string; submit: string | null } {
  const w = Math.max(1, Math.min(width, 8));
  if (key === "clear") return { typed: "", submit: null };
  if (key === "back") return { typed: typed.slice(0, -1), submit: null };
  if (!/^\d$/.test(key)) return { typed, submit: null };
  const next = (typed.replace(/\D/g, "") + key).slice(0, w);
  if (next.length >= w) return { typed: "", submit: next.padStart(w, "0") };
  return { typed: next, submit: null };
}
