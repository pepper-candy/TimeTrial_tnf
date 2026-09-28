import { NextResponse } from "next/server";
import { PHOTO_MAX_BYTES } from "@/lib/photo";
import { getEvent, putPhoto } from "@/lib/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  const event = await getEvent(code);
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });
  const form = await req.formData();
  const file = form.get("file");
  const runnerId = String(form.get("runnerId") || "");
  if (!(file instanceof File) || !runnerId) {
    return NextResponse.json({ error: "file + runnerId" }, { status: 400 });
  }
  if (!event.runners.some((r) => r.id === runnerId)) {
    return NextResponse.json({ error: "runner" }, { status: 404 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > PHOTO_MAX_BYTES) {
    return NextResponse.json({ error: "too large" }, { status: 413 });
  }
  const mime = file.type === "image/webp" ? "image/webp" : "image/jpeg";
  const next = await putPhoto(event, runnerId, buf, mime);
  return NextResponse.json({ event: next, rev: next.rev });
}
