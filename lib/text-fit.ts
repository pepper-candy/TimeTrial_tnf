/**
 * Show a label only when the whole string fits.
 * A clipped or ellipsized stub is treated as not fitting.
 */
export function textFits(textWidth: number, available: number): boolean {
  if (!(available > 12) || !(textWidth >= 0)) return false;
  return textWidth <= available + 1;
}
