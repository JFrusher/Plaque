import { describe, expect, it } from "vitest";
import type { CardSpec, SheetSpec } from "../types";
import { cardOriginOnSheet, computeLayout, fitCount, usableSize } from "./pageLayout";

const card = (over: Partial<CardSpec> = {}): CardSpec => ({
  widthMm: 85,
  heightMm: 55,
  fold: "none",
  foldPositionMm: 0,
  invertBackPanel: false,
  bleedMm: 0,
  ...over,
});

const sheet = (over: Partial<SheetSpec> = {}): SheetSpec => ({
  page: "A4",
  orientation: "portrait",
  marginTopMm: 10,
  marginRightMm: 10,
  marginBottomMm: 10,
  marginLeftMm: 10,
  gapXMm: 5,
  gapYMm: 5,
  cardRotationDeg: 0,
  printerMarginMm: 5,
  cropMarks: true,
  cutLines: true,
  foldGuides: true,
  bleedGuides: true,
  duplex: false,
  slugLine: false,
  ...over,
});

describe("fitCount", () => {
  it("counts gaps only between cards", () => {
    // 190 available, 85 wide, 5 gap -> 85 + 5 + 85 = 175 fits, a third would need 265.
    expect(fitCount(190, 85, 5)).toBe(2);
  });

  it("fits exactly when the maths is exact", () => {
    expect(fitCount(175, 85, 5)).toBe(2);
    expect(fitCount(174.99, 85, 5)).toBe(1);
  });

  it("returns 0 when a single card does not fit", () => {
    expect(fitCount(80, 85, 5)).toBe(0);
    expect(fitCount(190, 0, 5)).toBe(0);
  });
});

describe("computeLayout", () => {
  it("hits the spec's worked example: A4, 85x55, 10mm margins, 5mm gaps", () => {
    const layout = computeLayout(card(), sheet());
    expect(usableSize(sheet())).toEqual({ w: 190, h: 277 });
    expect(layout.cols).toBe(2);
    expect(layout.rows).toBe(4);
    expect(layout.perSheet).toBe(8);
  });

  it("places card index 5 at (100, 130)", () => {
    const layout = computeLayout(card(), sheet());
    // col 1, row 2: x = 10 + 1*(85+5), y = 10 + 2*(55+5)
    expect(cardOriginOnSheet(5, layout)).toEqual({ x: 100, y: 130 });
  });

  it("keeps every card inside the usable area", () => {
    const s = sheet();
    const layout = computeLayout(card(), s);
    for (let i = 0; i < layout.perSheet; i++) {
      const o = cardOriginOnSheet(i, layout);
      expect(o.x).toBeGreaterThanOrEqual(s.marginLeftMm);
      expect(o.y).toBeGreaterThanOrEqual(s.marginTopMm);
      expect(o.x + layout.footprint.w).toBeLessThanOrEqual(layout.pageWidthMm - s.marginRightMm);
      expect(o.y + layout.footprint.h).toBeLessThanOrEqual(layout.pageHeightMm - s.marginBottomMm);
    }
  });

  it("uses the rotated footprint when cards are turned on the sheet", () => {
    const layout = computeLayout(card({ widthMm: 85, heightMm: 110 }), sheet({ cardRotationDeg: 90 }));
    expect(layout.footprint).toEqual({ w: 110, h: 85 });
    // 190 usable across / 110 -> 1 col; 277 usable down / 85 with 5 gap -> 3 rows.
    expect(layout.cols).toBe(1);
    expect(layout.rows).toBe(3);
  });

  it("swaps the page for landscape", () => {
    const layout = computeLayout(card(), sheet({ orientation: "landscape" }));
    expect(layout.pageWidthMm).toBe(297);
    expect(layout.pageHeightMm).toBe(210);
  });

  it("reports zero rather than throwing when the card is larger than the page", () => {
    const layout = computeLayout(card({ widthMm: 400, heightMm: 400 }), sheet());
    expect(layout.perSheet).toBe(0);
    expect(() => cardOriginOnSheet(0, layout)).toThrow(/no cards fit/i);
  });
});
