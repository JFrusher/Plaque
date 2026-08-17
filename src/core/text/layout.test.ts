import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { layoutLines, type TextBlock } from "./layout";
import { blockHeightMm, lineHeightMm, loadFont, measureWidth } from "./measure";

const crimson = loadFont(
  "crimson",
  "Crimson Text",
  new Uint8Array(readFileSync("src/assets/fonts/CrimsonText-Regular.ttf")),
);

const block = (over: Partial<TextBlock> = {}): TextBlock => ({
  lines: ["Charis Smith"],
  fontSizePt: 18,
  lineHeight: 1.2,
  align: "center",
  vAlign: "middle",
  anchor: "align",
  letterSpacingMm: 0,
  w: 60,
  h: 20,
  ...over,
});

describe("layoutLines", () => {
  it("returns nothing for no lines", () => {
    expect(layoutLines(crimson, block({ lines: [] }))).toEqual([]);
  });

  it("reports the left end of the baseline whatever the alignment", () => {
    const width = measureWidth(crimson, "Charis Smith", 18);
    expect(layoutLines(crimson, block({ align: "left" }))[0]?.baseline.x).toBe(0);
    expect(layoutLines(crimson, block({ align: "center" }))[0]?.baseline.x).toBeCloseTo(
      (60 - width) / 2,
      10,
    );
    expect(layoutLines(crimson, block({ align: "right" }))[0]?.baseline.x).toBeCloseTo(
      60 - width,
      10,
    );
  });

  it("keeps the right edge fixed when right-aligned text shrinks", () => {
    const big = layoutLines(crimson, block({ align: "right", fontSizePt: 18 }))[0]!;
    const small = layoutLines(crimson, block({ align: "right", fontSizePt: 9 }))[0]!;
    expect(big.baseline.x + big.widthMm).toBeCloseTo(small.baseline.x + small.widthMm, 10);
  });

  it("keeps the centre fixed when centred text shrinks", () => {
    const big = layoutLines(crimson, block({ fontSizePt: 18 }))[0]!;
    const small = layoutLines(crimson, block({ fontSizePt: 9 }))[0]!;
    expect(big.baseline.x + big.widthMm / 2).toBeCloseTo(small.baseline.x + small.widthMm / 2, 10);
  });

  it("stacks lines one line height apart", () => {
    const lines = layoutLines(crimson, block({ lines: ["Alexander", "Wright"], h: 30 }));
    expect(lines[1]!.baseline.y - lines[0]!.baseline.y).toBeCloseTo(lineHeightMm(18, 1.2), 10);
  });

  it("centres a block vertically", () => {
    const h = 30;
    const lines = layoutLines(crimson, block({ lines: ["a", "b"], h, vAlign: "middle" }));
    const blockH = blockHeightMm(2, 18, 1.2);
    const first = lines[0]!.baseline.y;
    const topOfBlock = first - (first - (h - blockH) / 2);
    expect(topOfBlock).toBeCloseTo((h - blockH) / 2, 10);
  });

  it("puts a top-aligned first baseline one ascent below the box top", () => {
    const y = layoutLines(crimson, block({ vAlign: "top" }))[0]!.baseline.y;
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThan(blockHeightMm(1, 18, 1.2));
  });

  it("bottom-aligns the last baseline near the box floor", () => {
    const lines = layoutLines(crimson, block({ lines: ["a", "b"], vAlign: "bottom", h: 30 }));
    const last = lines[1]!.baseline.y;
    expect(last).toBeLessThan(30);
    expect(last).toBeGreaterThan(30 - blockHeightMm(1, 18, 1.2) - 0.001);
  });

  describe("shrink anchor", () => {
    it("follows the alignment by default, so one control covers the common case", () => {
      for (const align of ["left", "center", "right"] as const) {
        const followed = layoutLines(crimson, block({ align, anchor: "align" }));
        const explicit = layoutLines(crimson, block({ align, anchor: align }));
        expect(followed[0]!.baseline.x).toBeCloseTo(explicit[0]!.baseline.x, 10);
      }
    });

    it("separates where the block sits from how its lines sit", () => {
      // Lines centred relative to each other, block pinned to the left edge.
      const lines = layoutLines(
        crimson,
        block({ lines: ["Alexander", "Wright"], align: "center", anchor: "left", h: 40 }),
      );
      const blockW = Math.max(...lines.map((l) => l.widthMm));
      // The widest line starts at the box's left edge.
      expect(Math.min(...lines.map((l) => l.baseline.x))).toBeCloseTo(0, 10);
      // The narrower line is still centred within the block, not flush left.
      const narrow = lines.reduce((a, b) => (a.widthMm < b.widthMm ? a : b));
      expect(narrow.baseline.x).toBeCloseTo((blockW - narrow.widthMm) / 2, 10);
    });

    it("keeps the left edge fixed as left-anchored text shrinks", () => {
      const big = layoutLines(crimson, block({ align: "center", anchor: "left", fontSizePt: 18 }))[0]!;
      const small = layoutLines(crimson, block({ align: "center", anchor: "left", fontSizePt: 9 }))[0]!;
      expect(big.baseline.x).toBeCloseTo(small.baseline.x, 10);
    });

    it("keeps the right edge fixed as right-anchored text shrinks", () => {
      const big = layoutLines(crimson, block({ align: "center", anchor: "right", fontSizePt: 18 }))[0]!;
      const small = layoutLines(crimson, block({ align: "center", anchor: "right", fontSizePt: 9 }))[0]!;
      expect(big.baseline.x + big.widthMm).toBeCloseTo(small.baseline.x + small.widthMm, 10);
    });

    it("never puts the block outside the box", () => {
      for (const anchor of ["align", "left", "center", "right"] as const) {
        for (const align of ["left", "center", "right"] as const) {
          const lines = layoutLines(crimson, block({ align, anchor, lines: ["Ines", "Vane"] }));
          for (const line of lines) {
            expect(line.baseline.x).toBeGreaterThanOrEqual(-1e-9);
            expect(line.baseline.x + line.widthMm).toBeLessThanOrEqual(60 + 1e-9);
          }
        }
      }
    });
  });

  it("accounts for letter spacing in the reported width", () => {
    const plain = layoutLines(crimson, block({ align: "left" }))[0]!.widthMm;
    const spaced = layoutLines(crimson, block({ align: "left", letterSpacingMm: 0.5 }))[0]!.widthMm;
    expect(spaced).toBeGreaterThan(plain);
  });
});
