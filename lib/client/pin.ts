import { normalizeCode } from "@/lib/ids";

export function pinStorageKey(code: string) {
  return `tt:pin:${normalizeCode(code)}`;
}

export function getStoredPin(code: string): string {
  try {
    return localStorage.getItem(pinStorageKey(code)) || "";
  } catch {
    return "";
  }
}

export function setStoredPin(code: string, pin: string) {
  try {
    localStorage.setItem(pinStorageKey(code), pin.trim());
  } catch {
    /* private mode */
  }
}

export function boardTimesKey(code: string) {
  return `tt:board-times:${normalizeCode(code)}`;
}

export type BoardTimesMode = "split" | "cumulative";

export function getBoardTimesMode(code: string): BoardTimesMode {
  try {
    const v = localStorage.getItem(boardTimesKey(code));
    return v === "cumulative" ? "cumulative" : "split";
  } catch {
    return "split";
  }
}

export function setBoardTimesMode(code: string, mode: BoardTimesMode) {
  try {
    localStorage.setItem(boardTimesKey(code), mode);
  } catch {
    /* private mode */
  }
}
