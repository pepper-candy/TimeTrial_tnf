import { NextResponse } from "next/server";
import { isDenied, requireHelper, toPublic } from "@/lib/auth";
import { applyEdit } from "@/lib/edits";
import { updateEvent } from "@/lib/store";
import type { Mark } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  const gate = await requireHelper(req, code);
  if (isDenied(gate)) return gate;
  const body = (await req.json()) as {
    action?: string;
    actor?: string;
    bib?: string;
    bibs?: string[];
    index?: number;
    j?: number;
    to?: number;
    id?: string;
    markId?: string;
    tapId?: string;
    t?: number;
    marks?: Mark[];
  };
  const event = await updateEvent(code, (e) =>
    applyEdit(e, { ...body, actor: body.actor ?? "marker" }),
  );
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ event: toPublic(event) });
}
