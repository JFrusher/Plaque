import { describe, expect, it } from "vitest";
import type { CardSpec } from "../types";
import {
  defaultFoldPosition,
  foldInversionApplies,
  foldPositionIsValid,
  foldSegment,
  panelBounds,
  panelOf,
  transformForPanel,
  transformPointForPanel,
} from "./fold";

const tent = (over: Partial<CardSpec> = {}): CardSpec => ({
  widthMm: 85,
  heightMm: 110,
  fold: "horizontal",
  foldPositionMm: 55,
  invertBackPanel: true,
  bleedMm: 0,
  ...over,
});

describe("panels", () => {
  it("splits a horizontal fold into a back on top and a front below", () => {
    const c = tent();
    expect(panelBounds("back", c)).toEqual({ x: 0, y: 0, w: 85, h: 55 });
    expect(panelBounds("front", c)).toEqual({ x: 0, y: 55, w: 85, h: 55 });
  });

  it("derives the panel from the box centre, not its corners", () => {
    const c = tent();
    // Straddles the fold, but its centre is at y = 60, in the front panel.
    expect(panelOf({ x: 0, y: 50, w: 20, h: 20 }, c)).toBe("front");
    expect(panelOf({ x: 0, y: 10, w: 20, h: 20 }, c)).toBe("back");
  });

  it("splits a vertical fold into a front on the left and a back on the right", () => {
    const c = tent({ fold: "vertical", foldPositionMm: 42.5 });
    expect(panelBounds("front", c)).toEqual({ x: 0, y: 0, w: 42.5, h: 110 });
    expect(panelBounds("back", c)).toEqual({ x: 42.5, y: 0, w: 42.5, h: 110 });
    expect(panelOf({ x: 50, y: 10, w: 10, h: 10 }, c)).toBe("back");
  });

  it("treats an unfolded card as one panel", () => {
    const c = tent({ fold: "none" });
    expect(panelOf({ x: 0, y: 0, w: 10, h: 10 }, c)).toBe("single");
    expect(panelBounds("single", c)).toEqual({ x: 0, y: 0, w: 85, h: 110 });
  });
});

describe("inversion", () => {
  it("maps (10,10) to (75,45) — the spec's worked example", () => {
    expect(transformPointForPanel({ x: 10, y: 10 }, tent())).toEqual({ x: 75, y: 45 });
  });

  it("leaves the front panel alone", () => {
    expect(transformPointForPanel({ x: 10, y: 70 }, tent())).toEqual({ x: 10, y: 70 });
  });

  it("repositions a back-panel box and asks for 180, preserving its size", () => {
    const r = transformForPanel({ x: 10, y: 10, w: 20, h: 10 }, tent());
    expect(r.rotationDeg).toBe(180);
    expect(r.box).toEqual({ x: 55, y: 35, w: 20, h: 10 });
  });

  it("is its own inverse", () => {
    const c = tent();
    const there = transformPointForPanel({ x: 12, y: 7 }, c);
    expect(transformPointForPanel(there, c)).toEqual({ x: 12, y: 7 });
  });

  it("keeps the transformed box inside the back panel", () => {
    const c = tent();
    const r = transformForPanel({ x: 5, y: 5, w: 30, h: 15 }, c);
    expect(r.box.x).toBeGreaterThanOrEqual(0);
    expect(r.box.y).toBeGreaterThanOrEqual(0);
    expect(r.box.x + r.box.w).toBeLessThanOrEqual(c.widthMm);
    expect(r.box.y + r.box.h).toBeLessThanOrEqual(c.foldPositionMm);
  });

  it("does nothing when the toggle is off", () => {
    expect(foldInversionApplies(tent({ invertBackPanel: false }))).toBe(false);
    expect(transformPointForPanel({ x: 10, y: 10 }, tent({ invertBackPanel: false }))).toEqual({
      x: 10,
      y: 10,
    });
  });

  it("does not apply to a vertical fold — that fold mirrors, and mirrored glyphs are unreadable", () => {
    const c = tent({ fold: "vertical", foldPositionMm: 42.5 });
    expect(foldInversionApplies(c)).toBe(false);
    expect(transformPointForPanel({ x: 60, y: 10 }, c)).toEqual({ x: 60, y: 10 });
  });
});

describe("fold guide", () => {
  it("runs across the card for a horizontal fold", () => {
    expect(foldSegment(tent())).toEqual([
      { x: 0, y: 55 },
      { x: 85, y: 55 },
    ]);
  });

  it("runs down the card for a vertical fold", () => {
    expect(foldSegment(tent({ fold: "vertical", foldPositionMm: 42.5 }))).toEqual([
      { x: 42.5, y: 0 },
      { x: 42.5, y: 110 },
    ]);
  });

  it("is absent when the card does not fold", () => {
    expect(foldSegment(tent({ fold: "none" }))).toBeNull();
  });
});

describe("fold position", () => {
  it("defaults to halfway on the folding axis", () => {
    expect(defaultFoldPosition({ widthMm: 85, heightMm: 110, fold: "horizontal" })).toBe(55);
    expect(defaultFoldPosition({ widthMm: 85, heightMm: 110, fold: "vertical" })).toBe(42.5);
  });

  it("rejects a fold on or outside the card edge", () => {
    expect(foldPositionIsValid(tent({ foldPositionMm: 0 }))).toBe(false);
    expect(foldPositionIsValid(tent({ foldPositionMm: 110 }))).toBe(false);
    expect(foldPositionIsValid(tent({ foldPositionMm: 30 }))).toBe(true);
    expect(foldPositionIsValid(tent({ fold: "none", foldPositionMm: 999 }))).toBe(true);
  });
});
