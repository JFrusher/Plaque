import { describe, expect, it } from "vitest";
import type { CardSpec, SheetSpec } from "../types";
import { hasErrors, validateGeometry } from "./validate";

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
  ...over,
});

const ids = (c: CardSpec, s: SheetSpec) => validateGeometry(c, s).map((i) => i.id);

describe("validateGeometry", () => {
  it("says nothing about a sane setup", () => {
    expect(validateGeometry(card(), sheet())).toEqual([]);
  });

  it("warns when neighbouring bleeds would overlap", () => {
    expect(ids(card({ bleedMm: 3 }), sheet({ gapXMm: 5, gapYMm: 5 }))).toContain("bleed-overlap");
    expect(ids(card({ bleedMm: 3 }), sheet({ gapXMm: 6, gapYMm: 6 }))).not.toContain("bleed-overlap");
  });

  it("warns when a margin is inside the printer's dead border", () => {
    expect(ids(card(), sheet({ marginLeftMm: 3, printerMarginMm: 5 }))).toContain("printer-margin");
  });

  it("warns when crop marks would run off the page", () => {
    expect(ids(card({ bleedMm: 3 }), sheet({ marginTopMm: 6 }))).toContain("crop-marks-clipped");
    expect(ids(card({ bleedMm: 0 }), sheet({ marginTopMm: 10 }))).not.toContain("crop-marks-clipped");
  });

  it("errors when no card fits, and says what to try", () => {
    const issues = validateGeometry(card({ widthMm: 300 }), sheet());
    expect(issues.map((i) => i.id)).toContain("no-fit");
    expect(hasErrors(issues)).toBe(true);
    expect(issues.find((i) => i.id === "no-fit")?.message).toMatch(/turning the cards/);
  });

  it("errors when margins swallow the page", () => {
    expect(ids(card(), sheet({ marginLeftMm: 120, marginRightMm: 120 }))).toContain(
      "margins-exceed-page",
    );
  });

  it("errors on a fold outside the card", () => {
    expect(ids(card({ fold: "horizontal", foldPositionMm: 80 }), sheet())).toContain("fold-position");
    expect(ids(card({ fold: "horizontal", foldPositionMm: 27.5 }), sheet())).not.toContain(
      "fold-position",
    );
  });

  it("warns that a vertical fold ignores back-panel inversion", () => {
    expect(
      ids(card({ fold: "vertical", foldPositionMm: 42.5, invertBackPanel: true }), sheet()),
    ).toContain("vertical-fold-inversion");
  });

  it("errors on a zero or negative card", () => {
    expect(ids(card({ widthMm: 0 }), sheet())).toContain("card-size");
    expect(ids(card({ bleedMm: -1 }), sheet())).toContain("bleed-negative");
  });

  it("does not call a tall card oversized when turning it on the sheet rescues it", () => {
    // 250 x 100 does not fit A4 portrait upright, but does when turned.
    expect(ids(card({ widthMm: 100, heightMm: 250 }), sheet({ cardRotationDeg: 90 }))).not.toContain(
      "card-larger-than-page",
    );
  });

  it("separates errors from warnings", () => {
    expect(hasErrors(validateGeometry(card({ bleedMm: 3 }), sheet()))).toBe(false);
  });
});
