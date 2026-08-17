import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { layoutLines } from "./layout";
import { loadFont } from "./measure";
import { availableFeatures, hangMm, opticalShiftMm, sideBearings } from "./optical";

const crimson = loadFont(
  "crimson",
  "Crimson Text",
  new Uint8Array(readFileSync("src/assets/fonts/CrimsonText-Regular.ttf")),
);

const block = (over: Partial<Parameters<typeof layoutLines>[1]> = {}) => ({
  lines: ["Charis."],
  fontSizePt: 18,
  lineHeight: 1.2,
  align: "center" as const,
  vAlign: "middle" as const,
  anchor: "align" as const,
  letterSpacingMm: 0,
  w: 70,
  h: 20,
  ...over,
});

describe("sideBearings", () => {
  it("reports the empty space at each end of a run", () => {
    const bearings = sideBearings(crimson, "Charis", 18);
    expect(bearings.left).toBeGreaterThanOrEqual(0);
    expect(bearings.right).toBeGreaterThanOrEqual(0);
  });

  it("finds more space after a full stop than after a letter", () => {
    // This asymmetry is exactly what optical centring exists to correct.
    expect(sideBearings(crimson, "Charis.", 18).right).toBeGreaterThan(
      sideBearings(crimson, "CharisX", 18).right,
    );
  });

  it("is zero for an empty run rather than NaN", () => {
    expect(sideBearings(crimson, "", 18)).toEqual({ left: 0, right: 0 });
  });
});

describe("opticalShiftMm", () => {
  it("pulls a line ending in punctuation to the right of metric centre", () => {
    // Metric centring makes "Charis." look left of centre; the shift undoes it.
    expect(opticalShiftMm(crimson, "Charis.", 18)).toBeGreaterThan(0);
  });

  it("scales with the type size", () => {
    const small = opticalShiftMm(crimson, "Charis.", 10);
    const large = opticalShiftMm(crimson, "Charis.", 30);
    expect(Math.abs(large)).toBeGreaterThan(Math.abs(small));
  });
});

describe("hangMm", () => {
  it("offers a hang for punctuation at either end", () => {
    expect(hangMm(crimson, '"Charis"', 18).left).toBeGreaterThan(0);
    expect(hangMm(crimson, "Charis,", 18).right).toBeGreaterThan(0);
  });

  it("offers nothing for a line that starts and ends with letters", () => {
    expect(hangMm(crimson, "Charis", 18)).toEqual({ left: 0, right: 0 });
  });
});

describe("layoutLines with optical settings", () => {
  it("changes nothing when they are off", () => {
    const plain = layoutLines(crimson, block());
    const explicit = layoutLines(
      crimson,
      block({ optical: { opticalAlign: false, hangingPunctuation: false, features: null } }),
    );
    expect(explicit[0]!.baseline.x).toBeCloseTo(plain[0]!.baseline.x, 9);
  });

  it("moves a centred line when optical centring is on", () => {
    const plain = layoutLines(crimson, block());
    const optical = layoutLines(
      crimson,
      block({ optical: { opticalAlign: true, hangingPunctuation: false, features: null } }),
    );
    expect(optical[0]!.baseline.x).not.toBeCloseTo(plain[0]!.baseline.x, 6);
  });

  it("pulls a hanging quote out past the left edge", () => {
    const lines = layoutLines(
      crimson,
      block({
        lines: ['"Charis"'],
        align: "left",
        optical: { opticalAlign: false, hangingPunctuation: true, features: null },
      }),
    );
    expect(lines[0]!.baseline.x).toBeLessThan(0);
  });

  it("leaves optical centring alone for left-aligned text", () => {
    const plain = layoutLines(crimson, block({ align: "left" }));
    const optical = layoutLines(
      crimson,
      block({
        align: "left",
        optical: { opticalAlign: true, hangingPunctuation: false, features: null },
      }),
    );
    expect(optical[0]!.baseline.x).toBeCloseTo(plain[0]!.baseline.x, 9);
  });
});

describe("availableFeatures", () => {
  it("lists what the face actually supports, for the ligature switch", () => {
    const features = availableFeatures(crimson);
    expect(Array.isArray(features)).toBe(true);
    expect(features).toContain("kern");
  });
});
