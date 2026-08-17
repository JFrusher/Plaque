import { describe, expect, it } from "vitest";
import { computeLayout } from "../geometry/pageLayout";
import { defaultCard, defaultSheet } from "../template/defaults";
import { STOCK_PRESETS, applyPreset, validatePreset, type StockPreset } from "./stockPresets";

const preset = (over: Partial<StockPreset> = {}): StockPreset => ({
  id: "test",
  name: "Test sheet",
  page: "A4",
  orientation: "portrait",
  widthMm: 63.5,
  heightMm: 38.1,
  columns: 3,
  rows: 7,
  gapXMm: 2.5,
  gapYMm: 0,
  ...over,
});

describe("STOCK_PRESETS", () => {
  it("ships some, and every shipped one is valid", () => {
    expect(STOCK_PRESETS.length).toBeGreaterThan(0);
    for (const p of STOCK_PRESETS) expect(validatePreset(p)).toBeNull();
  });

  it("has unique ids, or the picker would show two of the same thing", () => {
    expect(new Set(STOCK_PRESETS.map((p) => p.id)).size).toBe(STOCK_PRESETS.length);
  });

  it("lays out exactly the number of labels it claims", () => {
    // The check that matters: a preset whose grid does not actually impose is a
    // wasted sheet of pre-cut stock.
    for (const p of STOCK_PRESETS) {
      const applied = applyPreset(p);
      const layout = computeLayout(
        { ...defaultCard(), ...applied.card },
        { ...defaultSheet(), ...applied.sheet },
      );
      expect([p.id, layout.cols, layout.rows]).toEqual([p.id, p.columns, p.rows]);
      expect(layout.perSheet).toBe(p.columns * p.rows);
    }
  });
});

describe("applyPreset", () => {
  it("derives the margins from the grid, evenly", () => {
    // 3 x 63.5 + 2 x 2.5 = 195.5 on a 210mm page, so 7.25mm each side.
    const applied = applyPreset(preset());
    expect(applied.sheet.marginLeftMm).toBeCloseTo(7.25, 2);
    expect(applied.sheet.marginRightMm).toBeCloseTo(7.25, 2);
    // 7 x 38.1 = 266.7 on 297mm, so 15.15mm top and bottom.
    expect(applied.sheet.marginTopMm).toBeCloseTo(15.15, 2);
  });

  it("suppresses crop marks and cut lines — the cutting already happened", () => {
    const applied = applyPreset(preset());
    expect(applied.sheet.cropMarks).toBe(false);
    expect(applied.sheet.cutLines).toBe(false);
  });

  it("clears bleed, which has nothing left to trim on pre-cut stock", () => {
    expect(applyPreset(preset()).card.bleedMm).toBe(0);
  });

  it("takes the card size from the preset", () => {
    expect(applyPreset(preset()).card).toMatchObject({ widthMm: 63.5, heightMm: 38.1 });
  });
});

describe("validatePreset", () => {
  it("accepts a well-formed preset", () => {
    expect(validatePreset(preset())).toBeNull();
  });

  it("names the field that is wrong, so a bad contribution is findable", () => {
    expect(validatePreset(preset({ id: "" }))).toBe("id");
    expect(validatePreset({ ...preset(), page: "A3" })).toBe("page");
    expect(validatePreset({ ...preset(), widthMm: "63.5" })).toBe("widthMm");
    expect(validatePreset(preset({ columns: 0 }))).toBe("columns");
    expect(validatePreset(preset({ rows: 1.5 }))).toBe("rows");
    expect(validatePreset(null)).toBe("not an object");
  });

  it("rejects a grid that does not fit the paper", () => {
    expect(validatePreset(preset({ columns: 4 }))).toBe("columns");
    expect(validatePreset(preset({ rows: 9 }))).toBe("rows");
  });
});
