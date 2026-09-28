import { NextResponse } from "next/server";
import { deriveCourse, type CourseInput } from "@/lib/course";
import { getEvent, updateEvent } from "@/lib/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  const event = await getEvent(code);
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ event, now: Date.now() });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  const body = (await req.json()) as {
    name?: string;
    course?: CourseInput;
    status?: "setup" | "running" | "finished";
    demoAutoMark?: boolean;
  };
  const event = await updateEvent(code, (e) => {
    const next = { ...e };
    if (body.name != null) next.name = body.name;
    if (body.course) next.course = deriveCourse(body.course);
    if (body.status) next.status = body.status;
    if (body.demoAutoMark != null) next.demoAutoMark = body.demoAutoMark;
    return next;
  });
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ event });
}
