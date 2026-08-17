import { describe, expect, it } from "vitest";
import type { CardElement, CardSpec } from "../types";
import { MIN_SIZE_MM, clampBox, nearest, snapMove, snapResize, snapTargetsFor } from "./snap";

const card: CardSpec = {
  widthMm: 85,
  heightMm: 110,
  fold: "horizontal",
  foldPositionMm: 55,
  invertBackPanel: true,
  bleedMm: 0,
};

const el = (over: Partial<CardElement> = {}): CardElement =>
  ({
    kind: "rect",
    id: "other",
    x: 20,
    y: 30,
    w: 10,
    h: 10,
    z: 0,
    fillHex: null,
    strokeHex: "#000",
    strokeWidthMm: 0.3,
    dashed: false,
    ...over,
  }) as CardElement;

describe("snapTargetsFor", () => {
  it("offers the card edges, centre and fold", () => {
    const t = snapTargetsFor(card, [], null);
    expect(t.xs).toEqual([0, 42.5, 85]);
    expect(t.ys).toEqual([0, 55, 110]);
  });

  it("offers a vertical fold on the x axis instead", () => {
    const t = snapTargetsFor({ ...card, fold: "vertical", foldPositionMm: 30 }, [], null);
    expect(t.xs).toContain(30);
    expect(t.ys).not.toContain(30);
  });

  it("offers the edges and centres of other elements", () => {
    const t = snapTargetsFor(card, [el()], null);
    expect(t.xs).toEqual(expect.arrayContaining([20, 25, 30]));
    expect(t.ys).toEqual(expect.arrayContaining([30, 35, 40]));
  });

  it("never offers the element being dragged as its own target", () => {
    const t = snapTargetsFor(card, [el({ id: "me", x: 7 })], "me");
    expect(t.xs).not.toContain(7);
  });

  it("deduplicates and sorts", () => {
    const t = snapTargetsFor(card, [el({ x: 0, w: 85 })], null);
    expect(t.xs).toEqual([...new Set(t.xs)].sort((a, b) => a - b));
  });
});

describe("nearest", () => {
  it("finds a target inside the threshold and ignores one outside", () => {
    expect(nearest(41.8, [0, 42.5, 85], 1)).toBe(42.5);
    expect(nearest(38, [0, 42.5, 85], 1)).toBeNull();
  });

  it("prefers the closer of two candidates", () => {
    expect(nearest(10.4, [10, 11], 1)).toBe(10);
  });
});

describe("snapMove", () => {
  const targets = snapTargetsFor(card, [], null);

  it("centres a box on the card centre when it drifts close", () => {
    const r = snapMove({ x: 21.6, y: 10, w: 40, h: 10 }, targets, 1);
    expect(r.box.x + r.box.w / 2).toBeCloseTo(42.5, 10);
    expect(r.hitXs).toEqual([42.5]);
  });

  it("moves by translation — the size never changes", () => {
    const r = snapMove({ x: 0.4, y: 0.4, w: 40, h: 10 }, targets, 1);
    expect(r.box.w).toBe(40);
    expect(r.box.h).toBe(10);
  });

  it("snaps a leading edge to the card edge", () => {
    const r = snapMove({ x: 0.6, y: 20, w: 10, h: 10 }, targets, 1);
    expect(r.box.x).toBe(0);
  });

  it("leaves a box alone when nothing is near", () => {
    const box = { x: 20, y: 20, w: 10, h: 10 };
    const r = snapMove(box, targets, 1);
    expect(r.box).toEqual(box);
    expect(r.hitXs).toEqual([]);
  });

  it("snaps to the fold line", () => {
    const r = snapMove({ x: 20, y: 45.4, w: 10, h: 10 }, targets, 1);
    expect(r.box.y + r.box.h).toBeCloseTo(55, 10);
  });
});

describe("snapResize", () => {
  const targets = snapTargetsFor(card, [], null);

  it("moves only the edge being dragged", () => {
    const r = snapResize({ x: 20, y: 20, w: 22, h: 10 }, targets, 1, { right: true });
    expect(r.box.x).toBe(20);
    expect(r.box.w).toBeCloseTo(22.5, 10);
  });

  it("keeps the far edge still when the near edge snaps", () => {
    const r = snapResize({ x: 0.6, y: 20, w: 20, h: 10 }, targets, 1, { left: true });
    expect(r.box.x).toBe(0);
    expect(r.box.x + r.box.w).toBeCloseTo(20.6, 10);
  });

  it("does nothing to edges that were not dragged", () => {
    const box = { x: 0.6, y: 0.6, w: 20, h: 10 };
    expect(snapResize(box, targets, 1, {}).box).toEqual(box);
  });
});

describe("clampBox", () => {
  it("refuses to let a box be dragged to nothing", () => {
    expect(clampBox({ x: 5, y: 5, w: 0, h: -3 })).toEqual({
      x: 5,
      y: 5,
      w: MIN_SIZE_MM,
      h: MIN_SIZE_MM,
    });
  });

  it("leaves a healthy box alone", () => {
    const box = { x: 1, y: 2, w: 30, h: 40 };
    expect(clampBox(box)).toEqual(box);
  });
});
