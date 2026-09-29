import { describe, expect, it } from "vitest";
import { decideSwipe, horizontalIntent } from "./swipe";

describe("decideSwipe", () => {
  it("commits once the drag passes 40% of the row", () => {
    expect(decideSwipe({ dx: -120, width: 300, velocity: 0 })).toBe("commit");
    expect(decideSwipe({ dx: -200, width: 300, velocity: 0 })).toBe("commit");
  });

  it("springs back when the drag stops short of 40% and is not a flick", () => {
    expect(decideSwipe({ dx: -119, width: 300, velocity: -0.1 })).toBe("cancel");
    expect(decideSwipe({ dx: -30, width: 300, velocity: 0 })).toBe("cancel");
  });

  it("commits a fast left flick after the row has clearly moved", () => {
    expect(decideSwipe({ dx: -40, width: 300, velocity: -0.8 })).toBe("commit");
    expect(decideSwipe({ dx: -36, width: 300, velocity: -0.5 })).toBe("commit");
  });

  it("ignores a flick that barely moved", () => {
    expect(decideSwipe({ dx: -20, width: 300, velocity: -2 })).toBe("cancel");
  });

  it("ignores a rightward drag and a zero-width row", () => {
    expect(decideSwipe({ dx: 160, width: 300, velocity: 1 })).toBe("cancel");
    expect(decideSwipe({ dx: -40, width: 0, velocity: -2 })).toBe("cancel");
  });
});

describe("horizontalIntent", () => {
  it("locks after a clear left move", () => {
    expect(horizontalIntent(-16, 4)).toBe(true);
    expect(horizontalIntent(-11, 0)).toBe(true);
  });

  it("leaves vertical movement to the scroller", () => {
    expect(horizontalIntent(-8, 24)).toBe(false);
    expect(horizontalIntent(-4, -30)).toBe(false);
  });

  it("does not lock a shallow diagonal or a tiny nudge", () => {
    expect(horizontalIntent(-12, -12)).toBe(false);
    expect(horizontalIntent(-10, 0)).toBe(false);
  });
});
