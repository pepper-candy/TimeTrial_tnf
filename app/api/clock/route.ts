import { NextResponse } from "next/server";

export { preferredRegion } from "@/lib/region";

export async function GET() {
  return NextResponse.json({ now: Date.now() });
}
