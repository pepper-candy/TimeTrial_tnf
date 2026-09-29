import { describe, expect, it } from "vitest";
import {
  APP_DEFAULT_TITLE,
  APP_DESCRIPTION,
  APP_NAME,
  APP_SHORT_NAME,
  APP_TAGLINE,
  APP_TITLE_TEMPLATE,
  boardDocumentTitle,
  boardShareHeadline,
  documentTitle,
} from "./brand";
import { iconSvg } from "./icon-svg";

describe("brand copy", () => {
  it("exposes the product name and share text in one place", () => {
    expect(APP_NAME).toBe("TNF Time Trial");
    expect(APP_SHORT_NAME).toBe("TNF Time Trial");
    expect(APP_TAGLINE).toBe("Live lap timing");
    expect(APP_TITLE_TEMPLATE).toBe("%s · TNF Time Trial");
    expect(APP_DEFAULT_TITLE).toBe("TNF Time Trial · Live Lap Timing");
    expect(APP_DESCRIPTION).toMatch(/Live lap timing for track time trials/);
    expect(APP_DESCRIPTION).toMatch(/splits, paces and rankings/);
  });

  it("builds per-page and board titles", () => {
    expect(documentTitle("Timer")).toBe("Timer · TNF Time Trial");
    expect(documentTitle("Marker")).toBe("Marker · TNF Time Trial");
    expect(documentTitle("Admin")).toBe("Admin · TNF Time Trial");
    expect(documentTitle("New Event")).toBe("New Event · TNF Time Trial");
    expect(boardDocumentTitle("Friday 5000")).toBe("Friday 5000 · Live Board");
    expect(boardDocumentTitle("  ")).toBe("Time trial · Live Board");
    expect(boardShareHeadline("Friday 5000")).toBe("Friday 5000");
    expect(boardShareHeadline(null)).toBe(APP_NAME);
  });
});

describe("icon mark", () => {
  it("is a near-black stopwatch with track-red, not moon/cyan", () => {
    const svg = iconSvg("full");
    expect(svg).toContain("#0A0A0A");
    expect(svg).toContain("#FF4D2E");
    expect(svg).toContain("#FFFFFF");
    expect(svg.toLowerCase()).not.toContain("cyan");
    expect(svg).not.toContain("#4ecbff");
    expect(svg).not.toContain("#2ee59b");
    expect(svg).not.toMatch(/moon/i);
  });

  it("simplifies the track to a single oval at tiny sizes", () => {
    const simple = iconSvg("simple");
    expect(simple).toContain("<ellipse");
    expect(simple.match(/stadium|A[\d.]+ [\d.]+ 0 0 1/g) ?? []).toHaveLength(0);
    expect(iconSvg("full")).toContain("A");
  });
});
