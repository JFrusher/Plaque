import { describe, expect, it } from "vitest";
import { PAGE_SIZES_MM, mmToPt, pageSizeMm, ptToMm, roundMm } from "./units";

describe("units", () => {
  it("converts one inch exactly", () => {
    expect(mmToPt(25.4)).toBe(72);
    expect(ptToMm(72)).toBe(25.4);
  });

  it("round-trips", () => {
    expect(ptToMm(mmToPt(85))).toBeCloseTo(85, 10);
  });

  it("gives A4 in points as pdf-lib expects", () => {
    // 595.28 x 841.89pt is the canonical A4 in PDF units.
    expect(mmToPt(PAGE_SIZES_MM.A4.w)).toBeCloseTo(595.28, 1);
    expect(mmToPt(PAGE_SIZES_MM.A4.h)).toBeCloseTo(841.89, 1);
  });

  it("swaps for landscape without mutating the table", () => {
    expect(pageSizeMm("A4", "portrait")).toEqual({ w: 210, h: 297 });
    expect(pageSizeMm("A4", "landscape")).toEqual({ w: 297, h: 210 });
    expect(PAGE_SIZES_MM.A4).toEqual({ w: 210, h: 297 });
  });

  it("has Letter to a tenth of a millimetre", () => {
    expect(pageSizeMm("LETTER", "portrait")).toEqual({ w: 215.9, h: 279.4 });
  });

  it("rounds to hundredths", () => {
    expect(roundMm(10.004)).toBe(10);
    expect(roundMm(10.005)).toBe(10.01);
    expect(roundMm(-0.0001)).toBe(-0);
  });
});
