import { describe, expect, it } from "vitest";
import { padKeyFromEvent } from "./pad-keys";

describe("padKeyFromEvent", () => {
  it("maps digits, backspace, clear, and enter", () => {
    expect(padKeyFromEvent({ key: "7" })).toBe("7");
    expect(padKeyFromEvent({ key: "0" })).toBe("0");
    expect(padKeyFromEvent({ key: "Backspace" })).toBe("back");
    expect(padKeyFromEvent({ key: "Delete" })).toBe("clear");
    expect(padKeyFromEvent({ key: "Escape" })).toBe("clear");
    expect(padKeyFromEvent({ key: "Enter" })).toBe("enter");
    expect(padKeyFromEvent({ key: "a" })).toBeNull();
    expect(padKeyFromEvent({ key: " " })).toBeNull();
  });
});
