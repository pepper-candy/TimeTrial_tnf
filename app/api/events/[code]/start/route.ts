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

/** Sprint Starter only — clear startedAt so a false bang can re-arm. TT keeps /timer START. */
export async function DELETE(req: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  const gate = await requireHelper(req, code);
  if (isDenied(gate)) return gate;
  if (gate.event.kind !== "sprint") {
    return NextResponse.json({ error: "sprint only" }, { status: 409 });
  }
  if (gate.event.startedAt == null && gate.event.status === "setup") {
    return NextResponse.json({ event: toPublic(gate.event), now: Date.now() });
  }
  const event = await updateEvent(code, (e) => ({
    ...e,
    status: "setup",
    startedAt: null,
    endedAt: null,
    // ready stays armed — Admin Ready is irreversible; Starter can bang again.
  }));
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ event: toPublic(event), now: Date.now() });
}
