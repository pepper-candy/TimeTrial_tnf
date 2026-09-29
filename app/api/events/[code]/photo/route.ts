import { NextResponse } from "next/server";
import { isDenied, requireHelper, toPublic } from "@/lib/auth";
import { FULL_MAX_BYTES, THUMB_MAX_BYTES } from "@/lib/photo";
import { getEvent, putPhoto } from "@/lib/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  const gate = await requireHelper(req, code);
  if (isDenied(gate)) return gate;
  const event = await getEvent(code);
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });
  const form = await req.formData();
  const runnerId = String(form.get("runnerId") || "");
  if (!runnerId || !event.runners.some((r) => r.id === runnerId)) {
    return NextResponse.json({ error: "runner" }, { status: 404 });
  }
  const thumbFile = fileOf(form.get("thumb") ?? form.get("file"));
  const fullFile = fileOf(form.get("full")) ?? thumbFile;
  if (!thumbFile || !fullFile) {
    return NextResponse.json({ error: "thumb + full" }, { status: 400 });
  }
  const thumbBuf = Buffer.from(await thumbFile.arrayBuffer());
  const fullBuf = Buffer.from(await fullFile.arrayBuffer());
  if (thumbBuf.length > THUMB_MAX_BYTES || fullBuf.length > FULL_MAX_BYTES) {
    return NextResponse.json({ error: "too large" }, { status: 413 });
  }
  const next = await putPhoto(event, runnerId, {
    thumb: { buf: thumbBuf, mime: thumbMime(thumbFile.type) },
    full: { buf: fullBuf, mime: fullMime(fullFile.type) },
  });
  return NextResponse.json({ event: toPublic(next), rev: next.rev });
}

function fileOf(value: FormDataEntryValue | null): File | null {
  return value instanceof File && value.size > 0 ? value : null;
}

function thumbMime(type: string): string {
  return type === "image/webp" ? "image/webp" : "image/jpeg";
}

function fullMime(type: string): string {
  if (type === "image/webp") return "image/webp";
  if (type === "image/png") return "image/png";
  return "image/jpeg";
}
