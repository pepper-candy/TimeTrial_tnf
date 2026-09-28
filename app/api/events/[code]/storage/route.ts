import { NextResponse } from "next/server";
import { isDenied, requireHelper } from "@/lib/auth";
import { getStorageBytes } from "@/lib/store";
import { STORAGE_CAP_BYTES } from "@/lib/storage";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  const gate = await requireHelper(req, code);
  if (isDenied(gate)) return gate;
  const used = await getStorageBytes();
  return NextResponse.json({ used, cap: STORAGE_CAP_BYTES });
}
