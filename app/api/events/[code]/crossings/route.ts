import { NextResponse } from "next/server";
import { isDenied, requireHelper, toPublic } from "@/lib/auth";
import { applyEdit } from "@/lib/edits";
import { updateEvent } from "@/lib/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

/** Admin (and helpers) pair-level corrections: delete, move, reassign, insert estimated. */
export async function POST(req: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  const gate = await requireHelper(req, code);
  if (isDenied(gate)) return gate;
  const body = (await req.json()) as {
    action?: string;
    actor?: string;
    bib?: string;
    index?: number;
    to?: number;
    tapId?: string;
    markId?: string;
    t?: number;
    id?: string;
  };
  const event = await updateEvent(code, (e) =>
    applyEdit(e, { ...body, actor: body.actor ?? "admin" }),
  );
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ event: toPublic(event) });
}
