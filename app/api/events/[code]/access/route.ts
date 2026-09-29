import { NextResponse } from "next/server";
import { isDenied, requireHelper, toPublic } from "@/lib/auth";
import { isValidPin, withHelperPin } from "@/lib/pin";
import { updateEvent } from "@/lib/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

/** Helper PIN for Admin to show again. null = created before PINs were kept; reset it. */
export async function GET(req: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  const gate = await requireHelper(req, code);
  if (isDenied(gate)) return gate;
  return NextResponse.json(
    { pin: gate.event.helperPin, access: gate.access },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  const gate = await requireHelper(req, code);
  if (isDenied(gate)) return gate;
  const body = (await req.json().catch(() => ({}))) as { pin?: string };
  const pin = (body.pin ?? "").trim();
  if (!isValidPin(pin)) return NextResponse.json({ error: "pin" }, { status: 400 });
  const event = await updateEvent(code, (e) => withHelperPin(e, pin));
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ event: toPublic(event), pin });
}
