import { describe, expect, it } from "vitest";
import type { Rect } from "../types";
import { fitImage } from "./imageFit";

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
