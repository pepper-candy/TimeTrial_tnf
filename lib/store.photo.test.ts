import { describe, expect, it } from "vitest";
import { defaultFiveK } from "./course";
import {
  deleteEvent,
  getPhoto,
  getStorageBytes,
  putPhoto,
  saveEvent,
} from "./store";
import type { EventState } from "./types";

function event(id: string, code: string): EventState {
  return {
    id,
    code,
    name: "Photo",
    createdAt: 0,
    status: "setup",
    ready: false,
    startedAt: null,
    endedAt: null,
    course: defaultFiveK(),
    runners: [
      { id: "r1", bib: "1", name: "Ada", studentId: "1", category: "Girls", photoVer: null },
    ],
    taps: [],
    marks: [],
    idles: [],
    groups: [],
    edits: [],
    demo: false,
    demoAutoMark: false,
    demoPlan: null,
    demoSpeed: 1,
    pinHash: null,
    hideStudentIds: false,
    helperPin: null,
    resultKmSplits: [1, 3],
    rev: 0,
  };
}

describe("in-memory photo store", () => {
  it("stores thumb and full under separate keys and counts bytes, then frees them on delete", async () => {
    const code = "PHTST";
    const before = await getStorageBytes();
    const saved = await saveEvent(event("evt-photo", code));
    const thumb = Buffer.from("thumb-bytes-xxxxxxxx");
    const full = Buffer.from("full-bytes-yyyyyyyyyyyyyyyy");
    const next = await putPhoto(saved, "r1", {
      thumb: { buf: thumb, mime: "image/webp" },
      full: { buf: full, mime: "image/jpeg" },
    });
    expect(next.runners[0].photoVer).toBeTruthy();
    const t = await getPhoto("evt-photo", "r1", "thumb");
    const f = await getPhoto("evt-photo", "r1", "full");
    expect(t?.mime).toBe("image/webp");
    expect(f?.mime).toBe("image/jpeg");
    expect(Buffer.from(t!.data, "base64").toString()).toBe("thumb-bytes-xxxxxxxx");
    expect(Buffer.from(f!.data, "base64").toString()).toBe("full-bytes-yyyyyyyyyyyyyyyy");
    const used = await getStorageBytes();
    expect(used).toBeGreaterThan(before);
    await deleteEvent(code);
    expect(await getPhoto("evt-photo", "r1", "thumb")).toBeNull();
    expect(await getStorageBytes()).toBeLessThanOrEqual(used);
  });
});
