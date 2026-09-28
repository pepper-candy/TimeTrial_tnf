import { NextResponse } from "next/server";
import { isDenied, requireHelper, toPublic } from "@/lib/auth";
import { appendTap, undoLastTap } from "@/lib/race";
import { updateEvent } from "@/lib/store";
import type { Tap } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  const gate = await requireHelper(req, code);
  if (isDenied(gate)) return gate;
  const body = (await req.json()) as {
    tap?: Tap;
    taps?: Tap[];
    undo?: boolean;
    id?: string;
  };
  const event = await updateEvent(code, (e) => {
    if (body.undo) {
      return { ...e, taps: undoLastTap(e.taps, body.id) };
    }
    const incoming = body.taps ?? (body.tap ? [body.tap] : []);
    let taps = e.taps;
    for (const tap of incoming) {
      if (!tap?.id || typeof tap.t !== "number") continue;
      taps = appendTap(taps, { id: String(tap.id), t: Math.round(tap.t) });
    }
    return { ...e, taps };
  });
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ event: toPublic(event) });
}
