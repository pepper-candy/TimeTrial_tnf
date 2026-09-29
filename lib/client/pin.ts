import { normalizeCode } from "@/lib/ids";

export function pinStorageKey(code: string) {
  return `tt:pin:${normalizeCode(code)}`;
}

function read(key: string): string {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function write(key: string, value: string | null) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

export function getStoredPin(code: string): string {
  return read(pinStorageKey(code));
}

export function setStoredPin(code: string, pin: string) {
  write(pinStorageKey(code), pin.trim());
}

const MASTER_KEY = "tt:master-key";

/** Owner's ADMIN_MASTER_KEY, remembered on this device once it unlocks an event. */
export function getMasterKey(): string {
  return read(MASTER_KEY);
}

export function setMasterKey(key: string | null) {
  write(MASTER_KEY, key?.trim() || null);
}

const ADMIN_EVENTS = "tt:admin-events";

export type AdminEvent = { code: string; name: string; at: number };

/** Events this device created — Admin opens without retyping the PIN. */
export function adminEvents(): AdminEvent[] {
  try {
    const list = JSON.parse(read(ADMIN_EVENTS) || "[]") as AdminEvent[];
    return Array.isArray(list) ? list.filter((e) => e && typeof e.code === "string") : [];
  } catch {
    return [];
  }
}

export function rememberAdmin(code: string, name: string) {
  const c = normalizeCode(code);
  const rest = adminEvents().filter((e) => e.code !== c);
  write(ADMIN_EVENTS, JSON.stringify([{ code: c, name, at: Date.now() }, ...rest].slice(0, 12)));
}

export function forgetAdmin(code: string) {
  const c = normalizeCode(code);
  write(ADMIN_EVENTS, JSON.stringify(adminEvents().filter((e) => e.code !== c)));
}

export function isAdminDevice(code: string): boolean {
  const c = normalizeCode(code);
  return adminEvents().some((e) => e.code === c);
}

export function boardTimesKey(code: string) {
  return `tt:board-times:${normalizeCode(code)}`;
}

/** Which number is big in a Board cell. Bowling style: running time big, lap split small. */
export type BoardTimesMode = "split" | "cumulative";

export function getBoardTimesMode(code: string): BoardTimesMode {
  return read(boardTimesKey(code)) === "split" ? "split" : "cumulative";
}

export function setBoardTimesMode(code: string, mode: BoardTimesMode) {
  write(boardTimesKey(code), mode);
}
