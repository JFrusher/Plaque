import { describe, expect, it } from "vitest";
import type { CardSpec } from "../types";
import { pageSizeMm } from "../units";
import { minimumGapMm, suggestLayouts } from "./suggestLayouts";

const card = (over: Partial<CardSpec> = {}): CardSpec => ({
  widthMm: 85,
  heightMm: 110,
  fold: "horizontal",
  foldPositionMm: 55,
  invertBackPanel: true,
  bleedMm: 0,
  ...over,
});

describe("suggestLayouts", () => {
  it("ranks A4 portrait 2x2 above A4 landscape 3x1 for a tent card", () => {
    const all = suggestLayouts(card(), { pages: ["A4"], maxResults: 10 });
    const best = all[0];
    expect(best).toBeDefined();
    expect(best?.page).toBe("A4");
    expect(best?.orientation).toBe("portrait");
    expect(best?.cardRotationDeg).toBe(0);
    expect(best?.perSheet).toBe(4);

    const landscape3up = all.find((s) => s.orientation === "landscape" && s.cardRotationDeg === 0);
    expect(landscape3up?.perSheet).toBe(3);
    expect(all.indexOf(best!)).toBeLessThan(all.indexOf(landscape3up!));
  });

  it("returns candidates sorted by cards per sheet, descending", () => {
    const all = suggestLayouts(card(), { maxResults: 20 });
    const counts = all.map((s) => s.perSheet);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it("never proposes a grid that overflows the usable area", () => {
    for (const c of [card(), card({ widthMm: 60, heightMm: 90 }), card({ widthMm: 148, heightMm: 105 })]) {
      for (const s of suggestLayouts(c, { maxResults: 20 })) {
        const page = pageSizeMm(s.page, s.orientation);
        const fw = s.cardRotationDeg === 90 ? c.heightMm : c.widthMm;
        const fh = s.cardRotationDeg === 90 ? c.widthMm : c.heightMm;
        const usedW = s.cols * fw + (s.cols - 1) * s.patch.gapXMm;
        const usedH = s.rows * fh + (s.rows - 1) * s.patch.gapYMm;
        expect(usedW).toBeLessThanOrEqual(page.w - s.patch.marginLeftMm - s.patch.marginRightMm + 1e-9);
        expect(usedH).toBeLessThanOrEqual(page.h - s.patch.marginTopMm - s.patch.marginBottomMm + 1e-9);
      }
    }
  });

  it("drops combinations where nothing fits instead of returning zero-card rows", () => {
    const all = suggestLayouts(card({ widthMm: 500, heightMm: 500 }));
    expect(all).toEqual([]);
    const some = suggestLayouts(card({ widthMm: 200, heightMm: 200 }), { maxResults: 20 });
    expect(some.every((s) => s.perSheet > 0)).toBe(true);
  });

  it("opens the gap so adjacent bleeds cannot overlap", () => {
    expect(minimumGapMm(card({ bleedMm: 0 }), 5)).toBe(5);
    expect(minimumGapMm(card({ bleedMm: 3 }), 5)).toBe(6);
    const all = suggestLayouts(card({ bleedMm: 3 }), { pages: ["A4"] });
    expect(all[0]?.patch.gapXMm).toBe(6);
  });

  it("respects the printer margin in every suggestion", () => {
    for (const s of suggestLayouts(card(), { printerMarginMm: 12, maxResults: 20 })) {
      expect(s.patch.marginLeftMm).toBe(12);
      expect(s.patch.marginTopMm).toBe(12);
    }
  });

  it("gives each suggestion a stable id and a readable label", () => {
    const all = suggestLayouts(card(), { maxResults: 20 });
    expect(new Set(all.map((s) => s.id)).size).toBe(all.length);
    expect(all[0]?.label).toMatch(/per sheet/);
  });
});
