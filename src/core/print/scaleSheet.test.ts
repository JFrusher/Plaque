import { describe, expect, it } from "vitest";
import { parseCsv } from "../csv/parse";
import { buildArtefacts } from "../data/artefacts";
import { paginate } from "../imposition/paginate";
import { noFit } from "../template/bindings";
import { defaultCard, defaultSheet, defaultTemplate } from "../template/defaults";
import type { ResolvedText, Sheet } from "../types";
import { scaleSheetContent } from "./scaleSheet";

const opts = { fitText: noFit, iconPath: () => null };

function sheetOf(): Sheet {
  const card = defaultCard();
  const { headers, rows } = parseCsv("First Name,Last Name\nCharis,Smith\nTobias,Ashdown\n");
  const sheet = { ...defaultSheet(), cropMarks: true, cutLines: true, foldGuides: true };
  const artefacts = buildArtefacts(rows, { kind: "per-row" }, headers);
  const built = paginate(defaultTemplate(headers, card), artefacts, card, sheet, opts).sheets[0];
  if (!built) throw new Error("no sheet");
  return built;
}

describe("scaleSheetContent", () => {
  it("returns the sheet untouched at 1", () => {
    const sheet = sheetOf();
    expect(scaleSheetContent(sheet, 1)).toBe(sheet);
  });

  it("leaves the paper size alone — it is the content being corrected", () => {
    const scaled = scaleSheetContent(sheetOf(), 1.05);
    expect(scaled.pageWidthMm).toBe(210);
    expect(scaled.pageHeightMm).toBe(297);
  });

  it("scales about the centre of the sheet, so the margins share the change", () => {
    const sheet = sheetOf();
    const scaled = scaleSheetContent(sheet, 1.1);
    const before = sheet.cards[0]!.origin;
    const after = scaled.cards[0]!.origin;
    // A card left of centre moves further left; the page centre is the fixed point.
    expect(after.x).toBeCloseTo(105 + (before.x - 105) * 1.1, 6);
    expect(after.y).toBeCloseTo(148.5 + (before.y - 148.5) * 1.1, 6);
  });

  it("grows the card footprint by the factor", () => {
    const sheet = sheetOf();
    const scaled = scaleSheetContent(sheet, 1.02);
    expect(scaled.cards[0]!.footprint.w).toBeCloseTo(sheet.cards[0]!.footprint.w * 1.02, 6);
  });

  it("scales text size and letter spacing with the box, never re-fitting", () => {
    const sheet = sheetOf();
    const original = sheet.cards[0]!.scene.elements.find((e): e is ResolvedText => e.kind === "text");
    const scaled = scaleSheetContent(sheet, 1.04).cards[0]!.scene.elements.find(
      (e): e is ResolvedText => e.kind === "text",
    );
    expect(original).toBeDefined();
    expect(scaled?.fontSizePt).toBeCloseTo(original!.fontSizePt * 1.04, 6);
    // The lines themselves are untouched: fitting already happened.
    expect(scaled?.lines).toEqual(original!.lines);
  });

  it("moves the crop marks with the cards, or the cutter cuts the wrong place", () => {
    const sheet = sheetOf();
    const scaled = scaleSheetContent(sheet, 1.03);
    expect(scaled.guides.cropMarks.length).toBe(sheet.guides.cropMarks.length);
    const [first] = sheet.guides.cropMarks;
    const [scaledFirst] = scaled.guides.cropMarks;
    expect(scaledFirst?.[0].x).toBeCloseTo(105 + (first![0].x - 105) * 1.03, 6);
  });

  it("shrinks as well as grows", () => {
    const sheet = sheetOf();
    const scaled = scaleSheetContent(sheet, 0.97);
    expect(scaled.cards[0]!.footprint.w).toBeLessThan(sheet.cards[0]!.footprint.w);
  });
});
