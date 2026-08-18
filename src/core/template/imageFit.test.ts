import { describe, expect, it } from "vitest";
import type { Rect } from "../types";
import { boxAtNaturalSize, boxFittedTo, boxWithAspect, fitImage } from "./imageFit";

const BOX: Rect = { x: 10, y: 20, w: 40, h: 20 };
/** Deliberately square, so a non-square box has to do the work. */
const SQUARE = { w: 100, h: 100 };
const WIDE = { w: 200, h: 100 };

describe("fitImage", () => {
  it("centres the artwork inside the box under contain, and does not clip", () => {
    const placed = fitImage(BOX, SQUARE, { fit: "contain" });
    expect(placed).toEqual({ x: 20, y: 20, drawnW: 20, drawnH: 20, clip: null });
  });

  it("fills the box under stretch, and does not clip", () => {
    const placed = fitImage(BOX, SQUARE, { fit: "stretch" });
    expect(placed).toEqual({ x: 10, y: 20, drawnW: 40, drawnH: 20, clip: null });
  });

  it("covers a wide box with a square image by overflowing its height", () => {
    const placed = fitImage(BOX, SQUARE, { fit: "cover" });
    expect(placed.drawnW).toBe(40);
    expect(placed.drawnH).toBe(40);
    // Centred by default: half the overflow above the box, half below.
    expect(placed.x).toBe(10);
    expect(placed.y).toBe(10);
    expect(placed.clip).toEqual(BOX);
  });

  it("covers a tall box with a wide image by overflowing its width", () => {
    const placed = fitImage({ x: 0, y: 0, w: 20, h: 40 }, WIDE, { fit: "cover" });
    expect(placed.drawnH).toBe(40);
    expect(placed.drawnW).toBe(80);
    expect(placed.x).toBe(-30);
    expect(placed.y).toBe(0);
  });

  it("pins the left edge of the artwork to the box at focusX 0", () => {
    const placed = fitImage({ x: 0, y: 0, w: 20, h: 40 }, WIDE, { fit: "cover", focusX: 0 });
    expect(placed.x).toBe(0);
  });

  it("pins the right edge of the artwork to the box at focusX 1", () => {
    const placed = fitImage({ x: 0, y: 0, w: 20, h: 40 }, WIDE, { fit: "cover", focusX: 1 });
    expect(placed.x + placed.drawnW).toBe(20);
  });

  it("pins the top and bottom edges at focusY 0 and 1", () => {
    const top = fitImage(BOX, SQUARE, { fit: "cover", focusY: 0 });
    expect(top.y).toBe(BOX.y);
    const bottom = fitImage(BOX, SQUARE, { fit: "cover", focusY: 1 });
    expect(bottom.y + bottom.drawnH).toBe(BOX.y + BOX.h);
  });

  it("scales the artwork by zoom on top of the cover scale", () => {
    const placed = fitImage(BOX, SQUARE, { fit: "cover", zoom: 2 });
    expect(placed.drawnW).toBe(80);
    expect(placed.drawnH).toBe(80);
  });

  it("never leaves a gap, at any focus or zoom", () => {
    for (const zoom of [1, 1.3, 4, 8]) {
      for (const focusX of [0, 0.25, 0.5, 1]) {
        for (const focusY of [0, 0.75, 1]) {
          const placed = fitImage(BOX, WIDE, { fit: "cover", zoom, focusX, focusY });
          expect(placed.x).toBeLessThanOrEqual(BOX.x);
          expect(placed.y).toBeLessThanOrEqual(BOX.y);
          expect(placed.x + placed.drawnW).toBeGreaterThanOrEqual(BOX.x + BOX.w);
          expect(placed.y + placed.drawnH).toBeGreaterThanOrEqual(BOX.y + BOX.h);
        }
      }
    }
  });

  it("clamps a zoom below 1, which would otherwise leave a gap", () => {
    const placed = fitImage(BOX, SQUARE, { fit: "cover", zoom: 0.25 });
    expect(placed.drawnW).toBe(40);
  });

  it("clamps zoom to 8 and focus to 0..1, because a project file is outside data", () => {
    const zoomed = fitImage(BOX, SQUARE, { fit: "cover", zoom: 99 });
    expect(zoomed.drawnW).toBe(320);
    const focused = fitImage({ x: 0, y: 0, w: 20, h: 40 }, WIDE, { fit: "cover", focusX: 5 });
    expect(focused.x + focused.drawnW).toBe(20);
  });

  it("draws nothing for a degenerate box or artwork, rather than throwing", () => {
    for (const fit of ["contain", "stretch", "cover"] as const) {
      expect(fitImage({ x: 3, y: 4, w: 0, h: 10 }, SQUARE, { fit })).toMatchObject({
        x: 3,
        y: 4,
        drawnW: 0,
        drawnH: 0,
      });
      expect(fitImage(BOX, { w: 0, h: 0 }, { fit })).toMatchObject({ drawnW: 0, drawnH: 0 });
    }
  });
});

describe("boxFittedTo", () => {
  const bounds = { x: 0, y: 0, w: 85, h: 55 };

  it("fills the bounds when the artwork has the same shape", () => {
    expect(boxFittedTo(bounds, 85 / 55)).toEqual({ x: 0, y: 0, w: 85, h: 55 });
  });

  it("centres a square inside a landscape card", () => {
    const box = boxFittedTo(bounds, 1);
    expect(box).toEqual({ x: 15, y: 0, w: 55, h: 55 });
  });

  it("centres a wide artwork inside a landscape card", () => {
    const box = boxFittedTo(bounds, 4);
    expect(box.w).toBe(85);
    expect(box.h).toBeCloseTo(21.25, 10);
    expect(box.y).toBeCloseTo((55 - 21.25) / 2, 10);
  });

  it("fills the bounds outright when there is no aspect to keep", () => {
    expect(boxFittedTo(bounds, null)).toEqual(bounds);
  });

  it("respects bounds that do not start at the origin, such as a tent panel", () => {
    const panel = { x: 0, y: 55, w: 85, h: 55 };
    expect(boxFittedTo(panel, 1)).toMatchObject({ x: 15, y: 55, w: 55, h: 55 });
  });
});

describe("boxWithAspect", () => {
  it("takes the artwork's shape while keeping the box's area and centre", () => {
    const box = { x: 10, y: 10, w: 40, h: 10 };
    const reshaped = boxWithAspect(box, 1);
    expect(reshaped.w).toBe(reshaped.h);
    expect(reshaped.w * reshaped.h).toBeCloseTo(400, 6);
    expect(reshaped.x + reshaped.w / 2).toBeCloseTo(30, 10);
    expect(reshaped.y + reshaped.h / 2).toBeCloseTo(15, 10);
  });

  it("leaves a box that already has the aspect alone", () => {
    const box = { x: 10, y: 10, w: 40, h: 20 };
    expect(boxWithAspect(box, 2)).toEqual(box);
  });
});

describe("boxAtNaturalSize", () => {
  const bounds = { x: 0, y: 0, w: 85, h: 55 };

  it("sizes 300 pixels to an inch, centred on where the box was", () => {
    // 600x300px at 300dpi is 2x1 inches: 50.8 x 25.4mm.
    // Centred well inside the card, so the clamp below has nothing to do here.
    const box = boxAtNaturalSize({ x: 30, y: 20, w: 4, h: 4 }, { w: 600, h: 300 }, bounds);
    expect(box.w).toBeCloseTo(50.8, 6);
    expect(box.h).toBeCloseTo(25.4, 6);
    expect(box.x + box.w / 2).toBeCloseTo(32, 6);
  });

  it("shrinks artwork too big for the card, keeping its shape", () => {
    const box = boxAtNaturalSize({ x: 0, y: 0, w: 10, h: 10 }, { w: 6000, h: 3000 }, bounds);
    expect(box.w).toBeLessThanOrEqual(85);
    expect(box.h).toBeLessThanOrEqual(55);
    expect(box.w / box.h).toBeCloseTo(2, 10);
  });

  it("keeps the box inside the bounds when its centre is at the edge", () => {
    const box = boxAtNaturalSize({ x: 84, y: 54, w: 1, h: 1 }, { w: 600, h: 300 }, bounds);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.w).toBeLessThanOrEqual(85 + 1e-9);
    expect(box.y + box.h).toBeLessThanOrEqual(55 + 1e-9);
  });
});
