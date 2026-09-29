import { NextResponse } from "next/server";
import { isDenied, requireHelper, toPublic } from "@/lib/auth";
import { deriveCourse, type CourseInput } from "@/lib/course";
import { deleteEvent, getRev, peekEvent, updateEvent } from "@/lib/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  const url = new URL(req.url);
  if (url.searchParams.has("head")) {
    const rev = await getRev(code);
    if (rev == null) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ rev, now: Date.now() });
  }
  const vRaw = url.searchParams.get("v");
  const since = vRaw == null || vRaw === "" ? null : Number(vRaw);
  const peek = await peekEvent(code, Number.isFinite(since as number) ? since : null);

  if (peek.status === "missing") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (peek.status === "unchanged") {
    return NextResponse.json({ unchanged: true, rev: peek.rev, now: peek.now });
  }
  return NextResponse.json({
    event: toPublic(peek.event),
    rev: peek.rev,
    now: peek.now,
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  const gate = await requireHelper(req, code);
  if (isDenied(gate)) return gate;
  const body = (await req.json()) as {
    name?: string;
    course?: CourseInput;
    status?: "setup" | "running" | "finished";
    demoAutoMark?: boolean;
    demoSpeed?: number;
    hideStudentIds?: boolean;
    resultKmSplits?: number[];
  };
  const event = await updateEvent(code, (e) => {
    const next = { ...e };
    if (body.name != null) next.name = body.name;
    if (body.course) next.course = deriveCourse(body.course);
    if (body.status) {
      next.status = body.status;
      if (body.status === "finished") next.endedAt = next.endedAt ?? Date.now();
    }
    if (body.demoAutoMark != null) next.demoAutoMark = body.demoAutoMark;
    if (body.demoSpeed != null && body.demoSpeed > 0) next.demoSpeed = body.demoSpeed;
    if (body.hideStudentIds != null) next.hideStudentIds = body.hideStudentIds;
    if (body.resultKmSplits) {
      next.resultKmSplits = body.resultKmSplits.filter((n) => n > 0);
    }
    return next;
  });
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ event: toPublic(event), rev: event.rev, now: Date.now() });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  const gate = await requireHelper(req, code);
  if (isDenied(gate)) return gate;
  const ok = await deleteEvent(code);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
