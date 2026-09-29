import { describe, expect, it } from "vitest";
import { eventLinks, helperShareText } from "./share";

describe("helper share message", () => {
  it("lists Timer and Marker links and the PIN", () => {
    const text = helperShareText({
      origin: "https://tt.example.com/",
      code: "AB12C",
      name: "Friday 5K",
      pin: "4821",
    });
    expect(text).toBe(
      [
        "*TNF Time Trial · Friday 5K*",
        "Timer: https://tt.example.com/e/AB12C/timer",
        "Marker: https://tt.example.com/e/AB12C/marker",
        "PIN: 4821",
        "Board: https://tt.example.com/e/AB12C/board",
      ].join("\n"),
    );
  });

  it("omits the PIN line when it is not stored", () => {
    const text = helperShareText({ origin: "https://x.dev", code: "Q", name: "5K", pin: null });
    expect(text).not.toContain("PIN");
    expect(eventLinks("https://x.dev", "Q").admin).toBe("https://x.dev/e/Q/admin");
  });
});
