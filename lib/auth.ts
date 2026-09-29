import { NextResponse } from "next/server";
import { pinFromRequest, verifyPin } from "./pin";
import { getStoredEvent } from "./store";
import type { EventState } from "./types";

/** Strip the hash so it never appears in poll JSON. */
export function toPublic(event: EventState): EventState {
  return {
    ...event,
    pinHash: null,
    hasPin: Boolean(event.pinHash),
  };
}

export async function requireHelper(
  req: Request,
  code: string,
): Promise<{ event: EventState } | NextResponse> {
  const event = await getStoredEvent(code);
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (event.pinHash && !verifyPin(pinFromRequest(req), event.pinHash)) {
    return NextResponse.json({ error: "pin" }, { status: 401 });
  }
  return { event };
}

export function isDenied(x: { event: EventState } | NextResponse): x is NextResponse {
  return x instanceof NextResponse;
}
