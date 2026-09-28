import { createHash, timingSafeEqual } from "crypto";

export function hashPin(pin: string): string {
  return createHash("sha256").update(`tt-pin:v1:${pin.trim()}`).digest("hex");
}

export function verifyPin(pin: string, pinHash: string | null | undefined): boolean {
  if (!pinHash) return true;
  const a = Buffer.from(hashPin(pin));
  const b = Buffer.from(pinHash);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function pinFromRequest(req: Request): string {
  return (req.headers.get("x-tt-pin") || "").trim();
}
