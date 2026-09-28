import { NextResponse } from "next/server";
import { makeDemoEvent } from "@/lib/demo";
import { saveEvent } from "@/lib/store";

export { preferredRegion } from "@/lib/region";
export const dynamic = "force-dynamic";

export async function POST() {
  const event = makeDemoEvent();
  await saveEvent(event);
  return NextResponse.json({ event });
}
