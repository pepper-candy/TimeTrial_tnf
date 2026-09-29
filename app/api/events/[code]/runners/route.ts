import { NextResponse } from "next/server";
import { isDenied, requireHelper, toPublic } from "@/lib/auth";
import { normalizeCategory } from "@/lib/category";
import { newId } from "@/lib/ids";
import { normalizeBib } from "@/lib/race";
import { deleteRunnerPhoto, updateEvent } from "@/lib/store";
import type { Runner } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  const gate = await requireHelper(req, code);
  if (isDenied(gate)) return gate;
  const body = (await req.json()) as {
    action?: "upsert" | "delete" | "replace" | "purge-photo";
    runner?: Partial<Runner> & { bib?: string };
    runners?: Runner[];
    id?: string;
    index?: number;
  };

  if (body.action === "delete") {
    const event = await updateEvent(code, (e) => {
      const id = body.id || body.runner?.id;
      return { ...e, runners: e.runners.filter((r) => r.id !== id) };
    });
    if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ event: toPublic(event), rev: event.rev });
  }

  if (body.action === "purge-photo") {
    const event = await updateEvent(code, async (e) => {
      const id = body.id;
      if (!id || e.runners.some((r) => r.id === id)) return e;
      await deleteRunnerPhoto(e.id, id);
      return e;
    });
    if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ event: toPublic(event), rev: event.rev });
  }

  const event = await updateEvent(code, (e) => {
    if (body.action === "replace" && Array.isArray(body.runners)) {
      return { ...e, runners: body.runners.map(stripPhotoBytes) };
    }
    const incoming = body.runner;
    if (!incoming) return e;
    const bib = incoming.bib != null ? normalizeBib(incoming.bib) : "";
    if (incoming.id) {
      const idx = e.runners.findIndex((r) => r.id === incoming.id);
      if (idx < 0) {
        if (!bib) return e;
        const restored: Runner = {
          id: incoming.id,
          bib,
          name: incoming.name?.trim() || "",
          studentId: incoming.studentId?.trim() || "",
          category: normalizeCategory(incoming.category),
          photoVer: incoming.photoVer ?? null,
        };
        const at =
          typeof body.index === "number"
            ? Math.max(0, Math.min(Math.floor(body.index), e.runners.length))
            : e.runners.length;
        const runners = [...e.runners];
        runners.splice(at, 0, restored);
        return { ...e, runners };
      }
      return {
        ...e,
        runners: e.runners.map((r) =>
          r.id === incoming.id
            ? {
                ...r,
                bib: bib || r.bib,
                name: incoming.name ?? r.name,
                studentId: incoming.studentId ?? r.studentId,
                category:
                  incoming.category === undefined
                    ? r.category
                    : normalizeCategory(incoming.category),
                photoVer: incoming.photoVer === undefined ? r.photoVer : incoming.photoVer,
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
      category: normalizeCategory(incoming.category),
      photoVer: incoming.photoVer ?? null,
    };
    const exists = e.runners.find((r) => normalizeBib(r.bib) === bib);
    if (exists) {
      return {
        ...e,
        runners: e.runners.map((r) =>
          r.id === exists.id
            ? { ...runner, id: exists.id, photoVer: runner.photoVer ?? exists.photoVer }
            : r,
        ),
      };
    }
    return { ...e, runners: [...e.runners, runner] };
  });
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ event: toPublic(event), rev: event.rev });
}

function stripPhotoBytes(r: Runner): Runner {
  return {
    id: r.id,
    bib: r.bib,
    name: r.name,
    studentId: r.studentId,
    category: normalizeCategory(r.category),
    photoVer: r.photoVer ?? null,
  };
}
