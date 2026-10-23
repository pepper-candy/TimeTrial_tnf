import { describe, expect, it } from "vitest";
import { MAX_SKEW_MS, SMALL_FUTURE_MS, clampClientStartedAt } from "./start-clock";

const RECV = 1_700_000_000_000;

describe("clampClientStartedAt", () => {
  it("keeps a client bang that arrived late (slow 4G POST)", () => {
    // Bang 800ms before the server received the POST — the whole point of the fix.
    const bangAt = RECV - 800;
    expect(clampClientStartedAt(bangAt, RECV)).toBe(bangAt);
  });

  it("keeps a client bang up to MAX_SKEW_MS in the past", () => {
    const bangAt = RECV - MAX_SKEW_MS;
    expect(clampClientStartedAt(bangAt, RECV)).toBe(bangAt);
  });

  it("clamps a stamp older than MAX_SKEW_MS to the past bound", () => {
    expect(clampClientStartedAt(RECV - MAX_SKEW_MS - 5_000, RECV)).toBe(
      RECV - MAX_SKEW_MS,
    );
  });

  it("keeps a small future stamp (offset estimate error)", () => {
    const bangAt = RECV + SMALL_FUTURE_MS;
    expect(clampClientStartedAt(bangAt, RECV)).toBe(bangAt);
  });

  it("clamps a wildly future stamp to the future bound", () => {
    expect(clampClientStartedAt(RECV + 60_000, RECV)).toBe(RECV + SMALL_FUTURE_MS);
  });

  it("falls back to receive time when the body is missing", () => {
    expect(clampClientStartedAt(undefined, RECV)).toBe(RECV);
    expect(clampClientStartedAt(null, RECV)).toBe(RECV);
  });

  it("falls back to receive time for non-finite / non-number stamps", () => {
    expect(clampClientStartedAt(Number.NaN, RECV)).toBe(RECV);
    expect(clampClientStartedAt(Number.POSITIVE_INFINITY, RECV)).toBe(RECV);
    expect(clampClientStartedAt("1700000000000", RECV)).toBe(RECV);
    expect(clampClientStartedAt({ startedAt: RECV }, RECV)).toBe(RECV);
  });

  it("rounds fractional stamps so stored startedAt stays integer ms", () => {
    expect(clampClientStartedAt(RECV - 800.6, RECV)).toBe(RECV - 801);
  });
});
