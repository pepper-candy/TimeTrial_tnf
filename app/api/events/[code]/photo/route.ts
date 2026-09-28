import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { updateEvent } from "@/lib/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  const form = await req.formData();
  const file = form.get("file");
  const runnerId = String(form.get("runnerId") || "");
  if (!(file instanceof File) || !runnerId) {
    return NextResponse.json({ error: "file + runnerId" }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > 1_500_000) {
    return NextResponse.json({ error: "too large" }, { status: 413 });
  }
  let photoUrl: string;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`tt/${code}/${runnerId}.jpg`, buf, {
      access: "public",
      contentType: file.type || "image/jpeg",
      addRandomSuffix: true,
    });
    photoUrl = blob.url;
  } else {
    photoUrl = `data:${file.type || "image/jpeg"};base64,${buf.toString("base64")}`;
  }
  const event = await updateEvent(code, (e) => ({
    ...e,
    runners: e.runners.map((r) => (r.id === runnerId ? { ...r, photoUrl } : r)),
  }));
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ event, photoUrl });
}
