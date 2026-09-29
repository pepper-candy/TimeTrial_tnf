import { NextResponse } from "next/server";
import { helperAccess } from "@/lib/pin";
import { getStoredEvent } from "@/lib/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  const event = await getStoredEvent(code);
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { pin?: string; key?: string };
  const access = helperAccess(event, {
    pin: (body.pin ?? "").trim(),
    key: (body.key ?? "").trim(),
  });
  if (!access) return NextResponse.json({ error: "pin" }, { status: 401 });
  return NextResponse.json({ ok: true, access });
}
