import { describe, expect, it } from "vitest";
import type { CardSpec } from "../types";
import { MARK_LENGTH_MM, cardGuides, type GuideOptions } from "./cropMarks";

const card = (over: Partial<CardSpec> = {}): CardSpec => ({
  widthMm: 85,
  heightMm: 110,
  fold: "horizontal",
  foldPositionMm: 55,
  invertBackPanel: true,
  bleedMm: 0,
  ...over,
});

const all: GuideOptions = { cropMarks: true, cutLines: true, foldGuides: true, bleedGuides: true };
const origin = { x: 20, y: 30 };

describe("cardGuides", () => {
  it("emits eight crop marks, two per corner", () => {
    expect(cardGuides(origin, card(), 0, all).cropMarks).toHaveLength(8);
  });

  it("pushes crop marks further out when the card bleeds", () => {
    const none = cardGuides(origin, card({ bleedMm: 0 }), 0, all).cropMarks;
    const bled = cardGuides(origin, card({ bleedMm: 3 }), 0, all).cropMarks;
    // The top-left horizontal mark's inner end sits at the bleed edge.
    expect(none[0]?.[1]).toEqual({ x: 20, y: 30 });
    expect(bled[0]?.[1]).toEqual({ x: 17, y: 30 });
    expect(none[0]?.[0]).toEqual({ x: 15, y: 30 });
    expect(bled[0]?.[0]).toEqual({ x: 12, y: 30 });
  });

  it("never lets a crop mark cross into the card", () => {
    const g = cardGuides(origin, card({ bleedMm: 3 }), 0, all);
    const box = { x0: 20, y0: 30, x1: 105, y1: 140 };
    for (const [a, b] of g.cropMarks) {
      for (const p of [a, b]) {
        const insideX = p.x > box.x0 && p.x < box.x1;
        const insideY = p.y > box.y0 && p.y < box.y1;
        expect(insideX && insideY).toBe(false);
      }
    }
  });

  it("keeps every mark exactly one arm long", () => {
    for (const [a, b] of cardGuides(origin, card({ bleedMm: 2 }), 0, all).cropMarks) {
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      expect(len).toBeCloseTo(MARK_LENGTH_MM, 10);
    }
  });

  it("draws the cut line as the card's trim outline", () => {
    const g = cardGuides(origin, card(), 0, all);
    expect(g.cutLines).toHaveLength(4);
    expect(g.cutLines[0]).toEqual([
      { x: 20, y: 30 },
      { x: 105, y: 30 },
    ]);
  });

  it("puts the fold guide across the card at the fold", () => {
    const g = cardGuides(origin, card(), 0, all);
    expect(g.foldGuides[0]).toEqual([
      { x: 20, y: 85 },
      { x: 105, y: 85 },
    ]);
  });

  it("turns the fold guide with the card when it is rotated on the sheet", () => {
    const g = cardGuides(origin, card(), 90, all);
    // Footprint is 110 x 85; the fold line becomes vertical at x = origin.x + 110 - 55.
    expect(g.foldGuides[0]).toEqual([
      { x: 75, y: 30 },
      { x: 75, y: 115 },
    ]);
  });

  it("has no fold guide on an unfolded card", () => {
    expect(cardGuides(origin, card({ fold: "none" }), 0, all).foldGuides).toEqual([]);
  });

  it("returns a bleed box only when there is bleed and the guide is on", () => {
    expect(cardGuides(origin, card({ bleedMm: 0 }), 0, all).bleedBox).toBeNull();
    expect(cardGuides(origin, card({ bleedMm: 3 }), 0, all).bleedBox).toEqual({
      x: 17,
      y: 27,
      w: 91,
      h: 116,
    });
    expect(
      cardGuides(origin, card({ bleedMm: 3 }), 0, { ...all, bleedGuides: false }).bleedBox,
    ).toBeNull();
  });

  it("emits nothing when every guide is switched off", () => {
    const g = cardGuides(origin, card({ bleedMm: 3 }), 0, {
      cropMarks: false,
      cutLines: false,
      foldGuides: false,
      bleedGuides: false,
    });
    expect(g).toEqual({ cropMarks: [], cutLines: [], foldGuides: [], bleedBox: null });
  });
});
