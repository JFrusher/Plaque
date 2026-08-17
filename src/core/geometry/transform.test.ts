import { describe, expect, it } from "vitest";
import {
  boxFromCentre,
  cardFootprint,
  cardPointToSheet,
  cardToSheet,
  centreOf,
  rotateBox,
  rotatePoint,
} from "./transform";

describe("rotatePoint", () => {
  it("is exact at 90 degrees — no floating point dust", () => {
    // Math.cos(Math.PI/2) is 6.1e-17. If that leaks in, this fails.
    expect(rotatePoint({ x: 10, y: 0 }, { x: 0, y: 0 }, 90)).toEqual({ x: 0, y: 10 });
  });

  it("rotates clockwise in a y-down system", () => {
    expect(rotatePoint({ x: 1, y: 0 }, { x: 0, y: 0 }, 90)).toEqual({ x: 0, y: 1 });
    expect(rotatePoint({ x: 1, y: 0 }, { x: 0, y: 0 }, 180)).toEqual({ x: -1, y: 0 });
    expect(rotatePoint({ x: 1, y: 0 }, { x: 0, y: 0 }, 270)).toEqual({ x: 0, y: -1 });
  });

  it("is the 2c - p reflection at 180", () => {
    const about = { x: 42.5, y: 27.5 };
    expect(rotatePoint({ x: 10, y: 10 }, about, 180)).toEqual({ x: 75, y: 45 });
  });

  it("normalises degrees outside 0..360", () => {
    expect(rotatePoint({ x: 1, y: 0 }, { x: 0, y: 0 }, 450)).toEqual({ x: 0, y: 1 });
    expect(rotatePoint({ x: 1, y: 0 }, { x: 0, y: 0 }, -90)).toEqual({ x: 0, y: -1 });
  });
});

describe("box helpers", () => {
  it("round-trips centre and box", () => {
    const b = { x: 10, y: 20, w: 30, h: 40 };
    expect(centreOf(b)).toEqual({ x: 25, y: 40 });
    expect(boxFromCentre(centreOf(b), b.w, b.h)).toEqual(b);
  });

  it("preserves width and height when rotating a box", () => {
    const b = { x: 10, y: 10, w: 20, h: 10 };
    const r = rotateBox(b, { x: 42.5, y: 27.5 }, 180);
    // Corners of the original span x 10..30, y 10..20. Rotated about (42.5,27.5)
    // they span x 55..75, y 35..45.
    expect(r).toEqual({ x: 55, y: 35, w: 20, h: 10 });
  });
});

describe("cardFootprint", () => {
  it("swaps only at 90", () => {
    expect(cardFootprint({ w: 85, h: 110 }, 0)).toEqual({ w: 85, h: 110 });
    expect(cardFootprint({ w: 85, h: 110 }, 90)).toEqual({ w: 110, h: 85 });
  });
});

describe("cardToSheet", () => {
  const card = { w: 85, h: 110 };

  it("is a plain translate at rotation 0", () => {
    expect(cardToSheet({ x: 5, y: 7, w: 20, h: 10 }, card, 0, { x: 10, y: 20 })).toEqual({
      x: 15,
      y: 27,
      w: 20,
      h: 10,
    });
  });

  it("puts card-local (0,0) at the footprint's top-right when rotated", () => {
    // Footprint is 110 x 85. Card-local origin lands at x = origin.x + 110.
    expect(cardPointToSheet({ x: 0, y: 0 }, card, 90, { x: 0, y: 0 })).toEqual({
      x: 110,
      y: 0,
    });
    expect(cardPointToSheet({ x: 85, y: 110 }, card, 90, { x: 0, y: 0 })).toEqual({
      x: 0,
      y: 85,
    });
  });

  it("keeps every card-local point inside the rotated footprint", () => {
    const corners = [
      { x: 0, y: 0 },
      { x: card.w, y: 0 },
      { x: 0, y: card.h },
      { x: card.w, y: card.h },
    ];
    const fp = cardFootprint(card, 90);
    for (const c of corners) {
      const p = cardPointToSheet(c, card, 90, { x: 12, y: 34 });
      expect(p.x).toBeGreaterThanOrEqual(12);
      expect(p.x).toBeLessThanOrEqual(12 + fp.w);
      expect(p.y).toBeGreaterThanOrEqual(34);
      expect(p.y).toBeLessThanOrEqual(34 + fp.h);
    }
  });

  it("agrees with cardPointToSheet on box centres", () => {
    const box = { x: 5, y: 7, w: 20, h: 10 };
    const origin = { x: 12, y: 34 };
    const viaBox = centreOf(cardToSheet(box, card, 90, origin));
    const viaPoint = cardPointToSheet(centreOf(box), card, 90, origin);
    expect(viaBox.x).toBeCloseTo(viaPoint.x, 10);
    expect(viaBox.y).toBeCloseTo(viaPoint.y, 10);
  });
});
