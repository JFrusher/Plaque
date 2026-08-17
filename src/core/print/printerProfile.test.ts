import { describe, expect, it } from "vitest";
import {
  MAX_BACK_OFFSET_MM,
  backCorrection,
  describeScale,
  effectiveScale,
  isNotableDrift,
  readingToCorrection,
  scaleFromMeasurement,
  type PrinterProfile,
} from "./printerProfile";

describe("scaleFromMeasurement", () => {
  it("returns 1 for an honest printer", () => {
    expect(scaleFromMeasurement(100)).toEqual({ ok: true, scale: 1 });
  });

  it("scales UP when the printer printed small", () => {
    // The classic driver "fit to page": 100mm arrives as 97mm, so the content
    // has to be enlarged for the next run to land at true size.
    const result = scaleFromMeasurement(97);
    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.scale).toBeCloseTo(1.031, 3);
  });

  it("scales DOWN when the printer printed large", () => {
    const result = scaleFromMeasurement(102);
    expect(result.ok && result.scale).toBeCloseTo(0.98, 3);
  });

  it("rejects a measurement that is obviously a typo", () => {
    // 10mm entered for a 100mm rule would scale every card tenfold.
    expect(scaleFromMeasurement(10)).toMatchObject({ ok: false });
    expect(scaleFromMeasurement(1000)).toMatchObject({ ok: false });
    const r = scaleFromMeasurement(10);
    expect(r.ok === false && r.reason).toMatch(/10%/);
  });

  it("rejects nonsense rather than producing Infinity", () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(scaleFromMeasurement(bad)).toMatchObject({ ok: false });
    }
  });

  it("works against a reference rule of another length", () => {
    expect(scaleFromMeasurement(50, 50)).toEqual({ ok: true, scale: 1 });
    const r = scaleFromMeasurement(49.5, 50);
    expect(r.ok && r.scale).toBeCloseTo(1.01, 3);
  });
});

describe("isNotableDrift", () => {
  it("ignores drift below the half-percent anyone could cut to", () => {
    expect(isNotableDrift(1)).toBe(false);
    expect(isNotableDrift(1.004)).toBe(false);
    expect(isNotableDrift(0.996)).toBe(false);
  });

  it("flags drift past half a percent in either direction", () => {
    expect(isNotableDrift(1.006)).toBe(true);
    expect(isNotableDrift(0.994)).toBe(true);
  });
});

describe("describeScale", () => {
  it("says which way the correction runs", () => {
    expect(describeScale(1.031)).toBe("3.1% larger");
    expect(describeScale(0.98)).toBe("2.0% smaller");
    expect(describeScale(1.001)).toBe("no correction");
  });
});

describe("back-side registration", () => {
  it("defaults to no correction", () => {
    expect(backCorrection(null)).toEqual({ dx: 0, dy: 0 });
    expect(backCorrection({ id: "p", name: "n", scale: 1, measuredMm: null, calibratedAt: null })).toEqual(
      { dx: 0, dy: 0 },
    );
  });

  it("ignores a half-written or nonsense value", () => {
    const profile: PrinterProfile = {
      id: "p",
      name: "n",
      scale: 1,
      measuredMm: null,
      calibratedAt: null,
      backOffsetXMm: Number.NaN,
    };
    expect(backCorrection(profile)).toEqual({ dx: 0, dy: 0 });
  });

  it("takes the reading as the correction, sign and all", () => {
    // The printed scales are laid out so no arithmetic is needed — see
    // render/pdf/duplexTestPdf.
    expect(readingToCorrection(1.5)).toBe(1.5);
    expect(readingToCorrection(-2)).toBe(-2);
    expect(readingToCorrection(0)).toBe(0);
    expect(readingToCorrection(Number.NaN)).toBe(0);
  });

  it("rounds to a tenth, which is the finest anyone reads off a printed scale", () => {
    expect(readingToCorrection(1.23)).toBe(1.2);
  });

  it("clamps a reading that cannot have come from the scale", () => {
    expect(readingToCorrection(400)).toBe(MAX_BACK_OFFSET_MM);
    expect(readingToCorrection(-400)).toBe(-MAX_BACK_OFFSET_MM);
  });
});

describe("effectiveScale", () => {
  const profile: PrinterProfile = {
    id: "p1",
    name: "Office laser",
    scale: 1.02,
    measuredMm: 98,
    calibratedAt: "2026-08-17T10:00:00.000Z",
  };

  it("falls back to 1 rather than distorting a print", () => {
    expect(effectiveScale(null)).toBe(1);
    expect(effectiveScale(undefined)).toBe(1);
    expect(effectiveScale(0)).toBe(1);
    expect(effectiveScale(Number.NaN)).toBe(1);
    expect(effectiveScale(-1)).toBe(1);
  });

  it("uses a calibrated factor", () => {
    expect(effectiveScale(profile.scale)).toBe(1.02);
  });
});
