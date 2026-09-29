import { NextResponse } from "next/server";
import { isDenied, requireHelper } from "@/lib/auth";
import { buildRunnerRaces } from "@/lib/race";
import { csvOfEvent } from "@/lib/stats";
import { getEvent } from "@/lib/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  const gate = await requireHelper(req, code);
  if (isDenied(gate)) return gate;
  const event = await getEvent(code);
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });
  const races = buildRunnerRaces(event);
  const csv = csvOfEvent(event, races);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${event.code}-results.csv"`,
    },
  });
}
