import { NextResponse } from "next/server";
import { deriveCourse, type CourseInput } from "@/lib/course";
import { newId, newJoinCode } from "@/lib/ids";
import { saveEvent } from "@/lib/store";
import type { EventState } from "@/lib/types";

export { preferredRegion } from "@/lib/region";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    course?: CourseInput;
  };
  const course = deriveCourse(body.course ?? {});
  const event: EventState = {
    id: newId(),
    code: newJoinCode(),
    name: (body.name?.trim() || defaultName(course.totalDistanceM)),
    createdAt: Date.now(),
    status: "setup",
    startedAt: null,
    course,
    runners: [],
    taps: [],
    marks: [],
    demo: false,
    demoAutoMark: false,
    demoPlan: null,
  };
  await saveEvent(event);
  return NextResponse.json({ event });
}

function defaultName(meters: number) {
  if (meters >= 1000 && meters % 1000 === 0) return `${meters / 1000}K`;
  return `${meters} m`;
}
