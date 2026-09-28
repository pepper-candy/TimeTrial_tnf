import { NextResponse } from "next/server";
import { updateEvent } from "@/lib/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  const startedAt = Date.now();
  const event = await updateEvent(code, (e) => ({
    ...e,
    status: "running",
    startedAt: e.startedAt ?? startedAt,
  }));
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ event, now: Date.now() });
}
