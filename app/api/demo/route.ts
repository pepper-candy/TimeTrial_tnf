import { NextResponse } from "next/server";
import { toPublic } from "@/lib/auth";
import { DEMO_PIN, makeDemoEvent } from "@/lib/demo";
import { saveEvent } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST() {
  const event = makeDemoEvent();
  await saveEvent(event);
  return NextResponse.json({ event: toPublic(event), pin: DEMO_PIN });
}
