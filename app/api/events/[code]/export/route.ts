import { NextResponse } from "next/server";
import { buildRunnerRaces } from "@/lib/race";
import { csvOfEvent } from "@/lib/stats";
import { getEvent } from "@/lib/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  const event = await getEvent(code);
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });
  const races = buildRunnerRaces(event, Date.now());
  const csv = csvOfEvent(event, races);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${event.code}-results.csv"`,
    },
  });
}
