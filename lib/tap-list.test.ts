import { describe, expect, it } from "vitest";
import { formatStopwatch, indexAfterSyncs, markPack, packIndex, tapRows } from "./tap-list";
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

  it("splits packs at idle breaks", () => {
    expect(packIndex(10, [{ t: 15 }])).toBe(0);
    expect(packIndex(20, [{ t: 15 }])).toBe(1);
    const rows = tapRows({ startedAt: 0, idles: [{ id: "i", t: 2500 }] }, [
      tap("a", 1000),
      tap("b", 2000),
      tap("c", 8000),
    ]);
    expect(rows.map((r) => r.pack)).toEqual([1, 0, 0]);
  });

  it("jumps the next tap number to max+1 after a padded sync", () => {
    const cut = { id: "s", at: 1, taps: 27, marks: 27, padTapIds: [], padMarkIds: ["q", "r"] };
    expect(indexAfterSyncs(24, "marks", [cut])).toBe(25);
    expect(indexAfterSyncs(27, "marks", [cut])).toBe(28);
    expect(indexAfterSyncs(26, "taps", [cut])).toBe(27);
    expect(indexAfterSyncs(27, "taps", [cut])).toBe(28);
    const rows = tapRows(
      { startedAt: 0, syncs: [{ id: "s", at: 1, taps: 2, marks: 2, padTapIds: [] }] },
      [tap("a", 1000), tap("b", 2000), tap("c", 3000)],
    );
    expect(rows.map((r) => r.id)).toEqual(["c", "b", "a"]);
    expect(rows.find((r) => r.id === "c")?.n).toBe(3);
    expect(rows.find((r) => r.id === "b")?.cutBefore).toBe(true);
  });
});

describe("markPack", () => {
  it("increments after the grouped mark", () => {
    const ids = ["a", "b", "c"];
    expect(markPack(0, ids, [{ afterId: "b" }])).toBe(0);
    expect(markPack(1, ids, [{ afterId: "b" }])).toBe(0);
    expect(markPack(2, ids, [{ afterId: "b" }])).toBe(1);
  });
});
