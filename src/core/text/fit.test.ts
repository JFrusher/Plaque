import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { FitConfig } from "../types";
import { DEFAULT_FIT, fitBlock, fitText, type FitInput } from "./fit";
import { loadFont, measureWidth, widestLineMm } from "./measure";

const crimson = loadFont(
  "crimson",
  "Crimson Text",
  new Uint8Array(readFileSync("src/assets/fonts/CrimsonText-Regular.ttf")),
);

const fit = (over: Partial<FitConfig> = {}): FitConfig => ({ ...DEFAULT_FIT, ...over });

const input = (over: Partial<FitInput> = {}): FitInput => ({
  text: "Charis Smith",
  boxWMm: 65,
  boxHMm: 12,
  fontSizePt: 18,
  lineHeight: 1.2,
  letterSpacingMm: 0,
  fit: fit(),
  ...over,
});

describe("fitText", () => {
  it("leaves text that already fits alone", () => {
    const r = fitText(crimson, input());
    expect(r.fontSizePt).toBe(18);
    expect(r.lines).toEqual(["Charis Smith"]);
    expect(r.overflowed).toBe(false);
  });

  it("returns nothing for empty text without claiming overflow", () => {
    expect(fitText(crimson, input({ text: "" }))).toEqual({
      lines: [],
      fontSizePt: 18,
      overflowed: false,
    });
  });

  describe("shrink", () => {
    it("reduces the size until a long name fits the box", () => {
      const r = fitText(
        crimson,
        input({ text: "Bartholomew Featherstonehaugh", boxWMm: 80, fit: fit({ mode: "shrink" }) }),
      );
      expect(r.fontSizePt).toBeLessThan(18);
      expect(r.overflowed).toBe(false);
      expect(measureWidth(crimson, r.lines[0]!, r.fontSizePt)).toBeLessThanOrEqual(80);
    });

    it("never goes below the floor", () => {
      const r = fitText(
        crimson,
        input({
          text: "Bartholomew Featherstonehaugh",
          boxWMm: 20,
          fit: fit({ mode: "shrink", minFontSizePt: 10 }),
        }),
      );
      expect(r.fontSizePt).toBe(10);
    });

    it("reports overflow at the floor instead of shrinking into illegibility", () => {
      const r = fitText(
        crimson,
        input({
          text: "Bartholomew Featherstonehaugh",
          boxWMm: 20,
          fit: fit({ mode: "shrink", minFontSizePt: 10 }),
        }),
      );
      expect(r.overflowed).toBe(true);
      expect(measureWidth(crimson, r.lines[0]!, r.fontSizePt)).toBeGreaterThan(20);
    });

    it("shrinks in half-point steps", () => {
      const r = fitText(
        crimson,
        input({ text: "Bartholomew Featherstonehaugh", boxWMm: 80, fit: fit({ mode: "shrink" }) }),
      );
      expect((r.fontSizePt * 2) % 1).toBe(0);
    });

    it("stays on one line however long the name is", () => {
      const r = fitText(
        crimson,
        input({ text: "Alexander Featherstonehaugh", boxWMm: 40, fit: fit({ mode: "shrink" }) }),
      );
      expect(r.lines).toHaveLength(1);
    });

    it("also shrinks to fit the box height", () => {
      const r = fitText(crimson, input({ boxHMm: 3, fit: fit({ mode: "shrink" }) }));
      expect(r.fontSizePt).toBeLessThan(18);
    });
  });

  describe("wrap", () => {
    it("breaks at the space and keeps the size", () => {
      const r = fitText(
        crimson,
        input({
          text: "Alexander Featherstonehaugh",
          boxWMm: 45,
          boxHMm: 25,
          fit: fit({ mode: "wrap", maxLines: 2 }),
        }),
      );
      expect(r.fontSizePt).toBe(18);
      expect(r.lines).toEqual(["Alexander", "Featherstonehaugh"]);
    });

    it("reports overflow rather than shrinking", () => {
      const r = fitText(
        crimson,
        input({ text: "Featherstonehaugh", boxWMm: 15, fit: fit({ mode: "wrap", maxLines: 2 }) }),
      );
      expect(r.fontSizePt).toBe(18);
      expect(r.overflowed).toBe(true);
    });
  });

  describe("shrink-then-wrap", () => {
    it("uses both lines and a smaller size to fit a hard case", () => {
      const r = fitText(
        crimson,
        input({
          text: "Bartholomew Featherstonehaugh",
          boxWMm: 40,
          boxHMm: 20,
          fit: fit({ mode: "shrink-then-wrap", maxLines: 2, minFontSizePt: 6 }),
        }),
      );
      expect(r.lines.length).toBeGreaterThan(1);
      expect(r.overflowed).toBe(false);
      expect(widestLineMm(crimson, r.lines, r.fontSizePt, 0)).toBeLessThanOrEqual(40);
    });

    it("re-wraps at each size rather than reusing the first breaks", () => {
      // At 18pt this needs three lines in a 30mm box; once shrunk it fits two.
      const r = fitText(
        crimson,
        input({
          text: "one two three four",
          boxWMm: 30,
          boxHMm: 14,
          fit: fit({ mode: "shrink-then-wrap", maxLines: 2, minFontSizePt: 6 }),
        }),
      );
      expect(r.lines).toHaveLength(2);
      expect(r.lines.join(" ")).toBe("one two three four");
    });
  });

  describe("none", () => {
    it("keeps the requested size and reports the overflow", () => {
      const r = fitText(
        crimson,
        input({ text: "Bartholomew Featherstonehaugh", boxWMm: 20, fit: fit({ mode: "none" }) }),
      );
      expect(r.fontSizePt).toBe(18);
      expect(r.overflowed).toBe(true);
      expect(r.lines).toHaveLength(1);
    });

    it("flattens newlines onto the single line", () => {
      const r = fitText(crimson, input({ text: "Charis\nSmith", fit: fit({ mode: "none" }) }));
      expect(r.lines).toEqual(["Charis Smith"]);
    });
  });

  it("treats a floor above the starting size as the starting size", () => {
    const r = fitText(
      crimson,
      input({ text: "Featherstonehaugh", boxWMm: 10, fontSizePt: 9, fit: fit({ minFontSizePt: 20 }) }),
    );
    expect(r.fontSizePt).toBe(9);
    expect(r.overflowed).toBe(true);
  });

  it("gives the same answer every time it is asked", () => {
    const i = input({ text: "Marguerite Pemberton-Blythe", boxWMm: 50 });
    expect(fitText(crimson, i)).toEqual(fitText(crimson, i));
  });
});

describe("fitBlock", () => {
  const font = crimson;
  const base = {
    boxWMm: 60,
    boxHMm: 40,
    fontSizePt: 12,
    lineHeight: 1.3,
    letterSpacingMm: 0,
    fit: { mode: "shrink" as const, minFontSizePt: 6, maxLines: 1, anchor: "align" as const },
  };

  it("leaves a block that already fits alone", () => {
    const out = fitBlock(font, { ...base, lines: ["Charis Smith", "Tobias Ashdown"] });
    expect(out.fontSizePt).toBe(12);
    expect(out.overflowed).toBe(false);
  });

  it("shrinks until the whole stack fits the height", () => {
    // Ten guests at 12pt is taller than 40mm; the block has to come down, and
    // ten lines still fit comfortably once it has.
    const lines = Array.from({ length: 10 }, (_, i) => `Guest ${i}`);
    const out = fitBlock(font, { ...base, lines });
    expect(out.fontSizePt).toBeLessThan(12);
    expect(out.overflowed).toBe(false);
  });

  it("shrinks for a line that is too wide, not just for height", () => {
    const out = fitBlock(font, { ...base, lines: ["A name far wider than sixty millimetres of box"] });
    expect(out.fontSizePt).toBeLessThan(12);
  });

  it("never re-wraps: a wrapped menu line would read as two guests", () => {
    const lines = ["Alexander Wright — Beef Wellington with dauphinoise"];
    expect(fitBlock(font, { ...base, lines }).lines).toEqual(lines);
  });

  it("stops at the floor and reports overflow rather than going illegible", () => {
    const lines = Array.from({ length: 200 }, (_, i) => `Guest ${i}`);
    const out = fitBlock(font, { ...base, lines });
    expect(out.fontSizePt).toBe(6);
    expect(out.overflowed).toBe(true);
  });

  it("reports overflow without shrinking when told not to shrink", () => {
    const lines = Array.from({ length: 50 }, (_, i) => `Guest ${i}`);
    const out = fitBlock(font, { ...base, lines, fit: { ...base.fit, mode: "none" } });
    expect(out.fontSizePt).toBe(12);
    expect(out.overflowed).toBe(true);
  });

  it("handles an empty list without dividing by anything", () => {
    expect(fitBlock(font, { ...base, lines: [] })).toMatchObject({ lines: [], overflowed: false });
  });
});
