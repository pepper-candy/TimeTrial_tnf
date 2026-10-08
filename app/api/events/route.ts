import { NextResponse } from "next/server";
import { toPublic } from "@/lib/auth";
import { deriveCourse, type CourseInput } from "@/lib/course";
import { newId, newJoinCode } from "@/lib/ids";
import { isValidPin, withHelperPin } from "@/lib/pin";
import { defaultResultKmSplits } from "@/lib/results";
import { saveEvent } from "@/lib/store";
import type { EventState } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    course?: CourseInput;
    pin?: string;
    resultKmSplits?: number[];
    hideStudentIds?: boolean;
  };
  const pin = (body.pin ?? "").trim();
  if (!isValidPin(pin)) {
    return NextResponse.json({ error: "pin" }, { status: 400 });
  }
  const course = deriveCourse(body.course ?? {});
  const base: EventState = {
    id: newId(),
    code: newJoinCode(),
    name: body.name?.trim() || defaultName(course.totalDistanceM),
    createdAt: Date.now(),
    status: "setup",
    ready: false,
    startedAt: null,
    endedAt: null,
    course,
    runners: [],
    taps: [],
    marks: [],
    edits: [],
    demo: false,
    demoAutoMark: false,
    demoPlan: null,
    demoSpeed: 1,
    pinHash: null,
    helperPin: null,
    hideStudentIds: Boolean(body.hideStudentIds),
    resultKmSplits:
      body.resultKmSplits?.length ? body.resultKmSplits : defaultResultKmSplits(course),
    rev: 0,
  };
  const event = withHelperPin(base, pin);
  await saveEvent(event);
  return NextResponse.json({ event: toPublic(event) });
}

function defaultName(meters: number) {
  if (meters >= 1000 && meters % 1000 === 0) return `${meters / 1000}K`;
  return `${meters} m`;
}
