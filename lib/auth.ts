import { NextResponse } from "next/server";
import { helperAccess, keyFromRequest, pinFromRequest, type Access } from "./pin";
import { getStoredEvent } from "./store";
import type { EventState } from "./types";

/** Strip the hash and plain PIN so neither appears in poll JSON. */
export function toPublic(event: EventState): EventState {
  return {
    ...event,
    pinHash: null,
    helperPin: null,
    hasPin: Boolean(event.pinHash),
  };
}

export async function requireHelper(
  req: Request,
  code: string,
): Promise<{ event: EventState; access: Access } | NextResponse> {
  const event = await getStoredEvent(code);
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });
  const access = helperAccess(event, { pin: pinFromRequest(req), key: keyFromRequest(req) });
  if (!access) return NextResponse.json({ error: "pin" }, { status: 401 });
  return { event, access };
}

export function isDenied(
  x: { event: EventState; access: Access } | NextResponse,
): x is NextResponse {
  return x instanceof NextResponse;
}
