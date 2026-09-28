import { NextResponse } from "next/server";
import { verifyPin } from "@/lib/pin";
import { getStoredEvent } from "@/lib/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  const event = await getStoredEvent(code);
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { pin?: string };
  const pin = (body.pin ?? "").trim();
  if (event.pinHash && !verifyPin(pin, event.pinHash)) {
    return NextResponse.json({ error: "pin" }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
