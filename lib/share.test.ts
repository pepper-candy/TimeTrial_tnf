import { describe, expect, it } from "vitest";
import { eventLinks, helperLink } from "./share";

describe("helper link", () => {
  it("is one URL and does not carry the PIN", () => {
    const url = helperLink("https://tt.example.com/", "AB12C");
    expect(url).toBe("https://tt.example.com/e/AB12C/help");
    expect(url).not.toMatch(/\n|pin|token/i);
    expect(eventLinks("https://tt.example.com/", "AB12C").helper).toBe(url);
    expect(eventLinks("https://x.dev", "Q").board).toBe("https://x.dev/e/Q/board");
  });
});
