import { describe, expect, it } from "vitest";
import { formatStopwatch, tapRows } from "./tap-list";
import type { Tap } from "./types";

function tap(id: string, t: number, estimated = false): Tap {
  return { id, t, estimated };
}

describe("formatStopwatch", () => {
  it("matches a phone stopwatch split", () => {
    expect(formatStopwatch(1080, true)).toBe("+00:01.08");
    expect(formatStopwatch(6170)).toBe("00:06.17");
    expect(formatStopwatch(3010, true)).toBe("+00:03.01");
  });
});

describe("tapRows", () => {
  it("lists newest first with a split and a cumulative time", () => {
    const rows = tapRows({ startedAt: 1_000 }, [
      tap("a", 1_000 + 3010),
      tap("b", 1_000 + 3010 + 1080),
      tap("c", 1_000 + 3010 + 1080 + 1100, true),
    ]);
    expect(rows.map((r) => r.n)).toEqual([3, 2, 1]);
    expect(rows[0]).toMatchObject({ id: "c", splitMs: 1100, elapsedMs: 5190, estimated: true });
    expect(rows[2]).toMatchObject({ id: "a", n: 1, splitMs: 3010, elapsedMs: 3010 });
    expect(formatStopwatch(rows[1].splitMs, true)).toBe("+00:01.08");
    expect(formatStopwatch(rows[1].elapsedMs)).toBe("00:04.09");
  });

  it("drops deleted taps", () => {
    const rows = tapRows({ startedAt: 0 }, [
      tap("a", 1000),
      { ...tap("b", 2000), deletedAt: 9 },
    ]);
    expect(rows.map((r) => r.id)).toEqual(["a"]);
  });
});
