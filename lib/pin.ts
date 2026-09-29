import { createHash, timingSafeEqual } from "crypto";
import type { EventState } from "./types";

type Env = Record<string, string | undefined>;

export const MASTER_KEY_ENV = "ADMIN_MASTER_KEY";
/** Short keys are too guessable to unlock every event. */
export const MASTER_KEY_MIN_LENGTH = 12;

export function hashPin(pin: string): string {
  return createHash("sha256").update(`tt-pin:v1:${pin.trim()}`).digest("hex");
}

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin.trim());
}

export function verifyPin(pin: string, pinHash: string | null | undefined): boolean {
  if (!pinHash) return true;
  const a = Buffer.from(hashPin(pin));
  const b = Buffer.from(pinHash);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function masterKeyFromEnv(env: Env = process.env): string | null {
  const key = env[MASTER_KEY_ENV]?.trim();
  return key && key.length >= MASTER_KEY_MIN_LENGTH ? key : null;
}

export function verifyMasterKey(given: string, env: Env = process.env): boolean {
  const key = masterKeyFromEnv(env);
  const g = given.trim();
  if (!key || !g) return false;
  const a = createHash("sha256").update(g).digest();
  const b = createHash("sha256").update(key).digest();
  return timingSafeEqual(a, b);
}

export type Access = "open" | "pin" | "master";

/** How a caller got in, or null when locked out. */
export function helperAccess(
  event: Pick<EventState, "pinHash">,
  creds: { pin?: string; key?: string },
  env: Env = process.env,
): Access | null {
  if (creds.key && verifyMasterKey(creds.key, env)) return "master";
  if (!event.pinHash) return "open";
  if (creds.pin && verifyPin(creds.pin, event.pinHash)) return "pin";
  return null;
}

/** Keeps the hash for checks and the plain PIN so Admin can show it again. */
export function withHelperPin<T extends Pick<EventState, "pinHash" | "helperPin">>(
  event: T,
  pin: string,
): T {
  const p = pin.trim();
  return { ...event, pinHash: hashPin(p), helperPin: p };
}

export function pinFromRequest(req: Request): string {
  return (req.headers.get("x-tt-pin") || "").trim();
}

export function keyFromRequest(req: Request): string {
  return (req.headers.get("x-tt-key") || "").trim();
}
