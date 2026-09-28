import { NextResponse } from "next/server";
import { getPhoto } from "@/lib/store";
import type { PhotoKind } from "@/lib/photo";

type Ctx = { params: Promise<{ eventId: string; runnerId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { eventId, runnerId } = await ctx.params;
  const url = new URL(req.url);
  const kind: PhotoKind = url.searchParams.get("s") === "full" ? "full" : "thumb";
  const rec = await getPhoto(eventId, runnerId, kind);
  if (!rec) return new NextResponse(null, { status: 404 });
  const v = url.searchParams.get("v");
  const buf = Buffer.from(rec.data, "base64");
  const immutable = v != null && v === rec.v;
  return new NextResponse(Uint8Array.from(buf), {
    headers: {
      "Content-Type": rec.mime || "image/jpeg",
      "Cache-Control": immutable
        ? "public, max-age=31536000, immutable"
        : "public, max-age=60",
      ETag: `"${rec.v}"`,
    },
  });
}
