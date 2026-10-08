import { NextResponse } from "next/server";
import { isDenied, requireHelper, toPublic } from "@/lib/auth";
import { updateEvent } from "@/lib/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  const gate = await requireHelper(req, code);
  if (isDenied(gate)) return gate;
  if (!gate.event.ready) {
    return NextResponse.json({ error: "not ready" }, { status: 409 });
  }
  const startedAt = Date.now();
  const event = await updateEvent(code, (e) => ({
    ...e,
    ready: true,
    status: "running",
    startedAt: e.startedAt ?? startedAt,
    endedAt: null,
  }));
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ event: toPublic(event), now: Date.now() });
}
