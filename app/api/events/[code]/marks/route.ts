import { NextResponse } from "next/server";
import {
  appendMark,
  deleteMark,
  insertMark,
  reassignMark,
  swapMarks,
} from "@/lib/race";
import { updateEvent } from "@/lib/store";
import type { Mark } from "@/lib/types";

export { preferredRegion } from "@/lib/region";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  const body = (await req.json()) as {
    action?: "append" | "delete" | "insert" | "swap" | "reassign" | "replace";
    bib?: string;
    index?: number;
    j?: number;
    marks?: Mark[];
  };
  const event = await updateEvent(code, (e) => {
    const action = body.action ?? "append";
    if (action === "replace" && Array.isArray(body.marks)) {
      return { ...e, marks: body.marks };
    }
    let marks = e.marks;
    if (action === "append" && body.bib) marks = appendMark(marks, body.bib);
    if (action === "delete" && body.index != null) marks = deleteMark(marks, body.index);
    if (action === "insert" && body.bib && body.index != null) {
      marks = insertMark(marks, body.index, body.bib);
    }
    if (action === "swap" && body.index != null && body.j != null) {
      marks = swapMarks(marks, body.index, body.j);
    }
    if (action === "reassign" && body.bib && body.index != null) {
      marks = reassignMark(marks, body.index, body.bib);
    }
    return { ...e, marks };
  });
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ event });
}
