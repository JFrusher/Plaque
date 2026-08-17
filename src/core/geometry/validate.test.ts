import { describe, expect, it } from "vitest";
import type { CardSpec, SheetSpec } from "../types";
import { hasErrors, validateGeometry, type ValidateContext } from "./validate";

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

const ids = (c: CardSpec, s: SheetSpec, printer?: ValidateContext) =>
  validateGeometry(c, s, printer).map((i) => i.id);

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

describe("validateGeometry — a measured printer (B4)", () => {
  const wide = sheet({
    marginTopMm: 8,
    marginRightMm: 8,
    marginBottomMm: 8,
    marginLeftMm: 8,
    printerMarginMm: 5,
  });

  it("uses the measured border rather than the advisory guess", () => {
    // 8mm margins clear a 5mm guess, but not a printer measured at 12mm.
    expect(ids(card(), wide)).not.toContain("printer-margin");
    expect(ids(card(), wide, { unprintableMarginMm: 12 })).toContain("printer-margin");
  });

  it("names the printer, so the warning is about a real machine", () => {
    const issues = validateGeometry(card(), wide, {
      printerName: "Kitchen inkjet",
      unprintableMarginMm: 12,
    });
    expect(issues.find((i) => i.id === "printer-margin")?.message).toContain("Kitchen inkjet");
  });

  it("ignores a half-written measurement instead of trusting it", () => {
    expect(ids(card(), wide, { unprintableMarginMm: Number.NaN })).not.toContain("printer-margin");
    expect(ids(card(), wide, { unprintableMarginMm: null })).not.toContain("printer-margin");
  });

  it("warns when a fold guide lands where the printer cannot draw", () => {
    // A fold 6mm down the card, on a sheet with a 4mm top margin, is 10mm from
    // the paper edge — inside a 12mm unprintable border.
    const folded = card({ fold: "horizontal", foldPositionMm: 6, heightMm: 55 });
    const tight = sheet({ marginTopMm: 4, foldGuides: true });
    expect(ids(folded, tight, { unprintableMarginMm: 12 })).toContain("fold-guide-clipped");
    expect(ids(folded, tight, { unprintableMarginMm: 2 })).not.toContain("fold-guide-clipped");
  });

  it("says nothing about fold guides that are switched off", () => {
    const folded = card({ fold: "horizontal", foldPositionMm: 6 });
    expect(
      ids(folded, sheet({ marginTopMm: 4, foldGuides: false }), { unprintableMarginMm: 12 }),
    ).not.toContain("fold-guide-clipped");
  });

  it("warns when the printer will trim the bleed before the user does", () => {
    const bled = card({ bleedMm: 3 });
    expect(ids(bled, sheet({ marginTopMm: 4, marginLeftMm: 4 }), { unprintableMarginMm: 6 })).toContain(
      "bleed-clipped",
    );
    expect(ids(bled, wide, { unprintableMarginMm: 2 })).not.toContain("bleed-clipped");
  });
});
