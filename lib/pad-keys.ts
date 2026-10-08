/** Map a physical key to on-screen pad ids. Null if it is not a pad key. */
export function padKeyFromEvent(e: { key: string }): string | null {
  if (e.key >= "0" && e.key <= "9") return e.key;
  if (e.key === "Backspace") return "back";
  if (e.key === "Delete" || e.key === "Escape") return "clear";
  if (e.key === "Enter") return "enter";
  return null;
}
