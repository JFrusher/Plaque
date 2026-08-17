import { readFileSync } from "node:fs";
import * as fontkit from "fontkit";
import { describe, expect, it } from "vitest";
import { ptToMm } from "../units";
import {
  blockHeightMm,
  breakLines,
  lineHeightMm,
  loadFont,
  measureWidth,
  widestLineMm,
} from "./measure";

const bytes = new Uint8Array(readFileSync("src/assets/fonts/CrimsonText-Regular.ttf"));
const crimson = loadFont("crimson", "Crimson Text", bytes);

describe("loadFont", () => {
  it("reads the metrics off the file", () => {
    expect(crimson.unitsPerEm).toBeGreaterThan(0);
    expect(crimson.ascent).toBeGreaterThan(0);
    expect(crimson.descent).toBeLessThan(0);
    expect(crimson.data).toBe(bytes);
  });

  it("rejects a font collection rather than silently using the first face", () => {
    expect(() => loadFont("x", "X", new Uint8Array([0, 1, 2, 3]))).toThrow();
  });
});

describe("measureWidth", () => {
  it("agrees with fontkit's own layout to within a hundredth of a millimetre", () => {
    const font = fontkit.create(bytes as Buffer);
    if ("fonts" in font) throw new Error("unexpected collection");
    const run = font.layout("Charis Smith");
    const expected = ptToMm((run.advanceWidth / font.unitsPerEm) * 18);
    expect(measureWidth(crimson, "Charis Smith", 18)).toBeCloseTo(expected, 2);
  });

  it("is zero for empty text", () => {
    expect(measureWidth(crimson, "", 18)).toBe(0);
  });

  it("scales linearly with size", () => {
    const a = measureWidth(crimson, "Eleanor", 12);
    const b = measureWidth(crimson, "Eleanor", 24);
    expect(b).toBeCloseTo(a * 2, 6);
  });

  it("adds letter spacing between characters only", () => {
    const plain = measureWidth(crimson, "abcd", 12);
    expect(measureWidth(crimson, "abcd", 12, 1)).toBeCloseTo(plain + 3, 6);
    expect(measureWidth(crimson, "a", 12, 1)).toBeCloseTo(measureWidth(crimson, "a", 12), 6);
  });

  it("measures a longer name as wider", () => {
    expect(measureWidth(crimson, "Bartholomew Featherstonehaugh", 18)).toBeGreaterThan(
      measureWidth(crimson, "Ines Vane", 18),
    );
  });

  it("handles accented and non-Latin text without throwing", () => {
    expect(measureWidth(crimson, "Chloé Ólafur", 18)).toBeGreaterThan(0);
    expect(() => measureWidth(crimson, "李伟", 18)).not.toThrow();
  });
});

describe("vertical metrics", () => {
  it("spaces baselines by size times line height", () => {
    expect(lineHeightMm(12, 1.2)).toBeCloseTo(ptToMm(14.4), 10);
  });

  it("measures a one-line block as one em box", () => {
    expect(blockHeightMm(1, 12, 1.2)).toBeCloseTo(ptToMm(12), 10);
  });

  it("adds a full line height for each extra line", () => {
    expect(blockHeightMm(3, 12, 1.2)).toBeCloseTo(ptToMm(12 + 14.4 * 2), 10);
  });

  it("is zero for no lines", () => {
    expect(blockHeightMm(0, 12, 1.2)).toBe(0);
  });
});

describe("breakLines", () => {
  it("breaks on the space, not mid-word", () => {
    const lines = breakLines(crimson, "Alexander Featherstonehaugh", 18, 40, 0, 2);
    expect(lines).toEqual(["Alexander", "Featherstonehaugh"]);
  });

  it("keeps text on one line when it fits", () => {
    expect(breakLines(crimson, "Ines Vane", 12, 100, 0, 2)).toEqual(["Ines Vane"]);
  });

  it("never splits a single over-wide word", () => {
    const lines = breakLines(crimson, "Featherstonehaugh", 18, 5, 0, 3);
    expect(lines).toEqual(["Featherstonehaugh"]);
  });

  it("loses no words when the text needs more lines than allowed", () => {
    const lines = breakLines(crimson, "one two three four five six", 18, 12, 0, 2);
    expect(lines).toHaveLength(2);
    expect(lines.join(" ").split(/\s+/).sort()).toEqual(
      ["five", "four", "one", "six", "three", "two"].sort(),
    );
  });

  it("honours an explicit newline", () => {
    expect(breakLines(crimson, "Charis\nSmith", 12, 200, 0, 2)).toEqual(["Charis", "Smith"]);
  });

  it("reports the widest line", () => {
    const lines = ["Ines", "Featherstonehaugh"];
    expect(widestLineMm(crimson, lines, 12, 0)).toBeCloseTo(measureWidth(crimson, lines[1]!, 12), 10);
  });
});
