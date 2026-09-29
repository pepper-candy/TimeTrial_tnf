import { describe, expect, it } from "vitest";
import { applyBibKey, bibDigitWidth, bibPrompt, padBib } from "./marker-bib";

describe("bib digit width", () => {
  it("follows the longest roster bib", () => {
    expect(bibDigitWidth(["3", "17", "317"])).toBe(3);
    expect(bibDigitWidth(["7", "12"])).toBe(2);
    expect(bibDigitWidth(["6"])).toBe(1);
    expect(bibDigitWidth([])).toBe(1);
  });

  it("zero-pads the Marker display to that width", () => {
    expect(padBib("7", 2)).toBe("07");
    expect(padBib("7", 3)).toBe("007");
    expect(padBib("317", 3)).toBe("317");
    expect(padBib("07", 2)).toBe("07");
  });
});

describe("auto-submit", () => {
  it("submits when the typed digits fill the width", () => {
    expect(applyBibKey("", "0", 2)).toEqual({ typed: "0", submit: null });
    expect(bibPrompt("0", 2)).toBe("0_");
    expect(applyBibKey("0", "7", 2)).toEqual({ typed: "", submit: "07" });
    expect(applyBibKey("00", "3", 3)).toEqual({ typed: "", submit: "003" });
    expect(applyBibKey("", "7", 1)).toEqual({ typed: "", submit: "7" });
  });

  it("backspace and clear do not submit", () => {
    expect(applyBibKey("0", "back", 2)).toEqual({ typed: "", submit: null });
    expect(applyBibKey("12", "clear", 3)).toEqual({ typed: "", submit: null });
    expect(bibPrompt("", 3)).toBe("___");
  });
});
