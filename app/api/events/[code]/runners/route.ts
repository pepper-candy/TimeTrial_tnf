import { NextResponse } from "next/server";
import { newId } from "@/lib/ids";
import { normalizeBib } from "@/lib/race";
import { updateEvent } from "@/lib/store";
import type { Runner } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  const body = (await req.json()) as {
    action?: "upsert" | "delete" | "replace";
    runner?: Partial<Runner> & { bib?: string };
    runners?: Runner[];
    id?: string;
  };
  const event = await updateEvent(code, (e) => {
    if (body.action === "replace" && Array.isArray(body.runners)) {
      return { ...e, runners: body.runners };
    }
    if (body.action === "delete") {
      const id = body.id || body.runner?.id;
      return { ...e, runners: e.runners.filter((r) => r.id !== id) };
    }
    const incoming = body.runner;
    if (!incoming) return e;
    const bib = incoming.bib != null ? normalizeBib(incoming.bib) : "";
    if (incoming.id) {
      return {
        ...e,
        runners: e.runners.map((r) =>
          r.id === incoming.id
            ? {
                ...r,
                bib: bib || r.bib,
                name: incoming.name ?? r.name,
                studentId: incoming.studentId ?? r.studentId,
                photoUrl:
                  incoming.photoUrl === undefined ? r.photoUrl : incoming.photoUrl,
              }
            : r,
        ),
      };
    }
    if (!bib) return e;
    const runner: Runner = {
      id: newId(),
      bib,
      name: incoming.name?.trim() || "",
      studentId: incoming.studentId?.trim() || "",
      photoUrl: incoming.photoUrl ?? null,
    };
    const exists = e.runners.find((r) => normalizeBib(r.bib) === bib);
    if (exists) {
      return {
        ...e,
        runners: e.runners.map((r) => (r.id === exists.id ? { ...runner, id: exists.id, photoUrl: runner.photoUrl ?? exists.photoUrl } : r)),
      };
    }
    return { ...e, runners: [...e.runners, runner] };
  });
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ event });
}
