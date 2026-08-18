import { describe, expect, it } from "vitest";
import type { CardElement, CardSpec } from "../types";
import { overflowIssues } from "./overflow";

const flat: CardSpec = {
  widthMm: 85,
  heightMm: 55,
  fold: "none",
  foldPositionMm: 0,
  invertBackPanel: false,
  bleedMm: 3,
};

const tent: CardSpec = { ...flat, heightMm: 110, fold: "horizontal", foldPositionMm: 55 };

const box = (over: Partial<CardElement> = {}): CardElement =>
  ({
    kind: "rect",
    id: "e1",
    x: 10,
    y: 10,
    w: 20,
    h: 20,
    z: 0,
    fillHex: null,
    strokeHex: "#000000",
    strokeWidthMm: 0.2,
    dashed: false,
    ...over,
  }) as CardElement;

describe("overflowIssues", () => {
  it("says nothing about an element inside the card", () => {
    expect(overflowIssues([box()], flat)).toEqual([]);
  });

  it("reports an element hanging off the right edge, and by how far", () => {
    const issues = overflowIssues([box({ x: 75, w: 20 })], flat);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ elementId: "e1", kind: "off-card" });
    expect(issues[0]?.detail).toContain("10mm");
  });

  it("reports an element off the top or left, where the overhang is negative", () => {
    expect(overflowIssues([box({ x: -5 })], flat)[0]).toMatchObject({ kind: "off-card" });
    expect(overflowIssues([box({ y: -5 })], flat)[0]).toMatchObject({ kind: "off-card" });
  });

  it("treats an element exactly filling the card as fitting", () => {
    expect(overflowIssues([box({ x: 0, y: 0, w: 85, h: 55 })], flat)).toEqual([]);
  });

  it("reports an element straddling the fold of a tent card", () => {
    const issues = overflowIssues([box({ x: 10, y: 45, w: 20, h: 20 })], tent);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ elementId: "e1", kind: "crosses-fold" });
  });

  it("leaves an element sitting wholly within one panel alone", () => {
    expect(overflowIssues([box({ x: 10, y: 10, w: 20, h: 20 })], tent)).toEqual([]);
    expect(overflowIssues([box({ x: 10, y: 70, w: 20, h: 20 })], tent)).toEqual([]);
  });

  it("says nothing about the fold on a card that has none, whatever the box", () => {
    expect(overflowIssues([box({ x: 0, y: 0, w: 85, h: 55 })], flat)).toEqual([]);
  });

  it("reports both faults for an element that is off the card and over the fold", () => {
    const issues = overflowIssues([box({ x: 80, y: 45, w: 20, h: 20 })], tent);
    expect(issues.map((i) => i.kind).sort()).toEqual(["crosses-fold", "off-card"]);
  });

  it("checks every element, and names each one", () => {
    const issues = overflowIssues([box({ id: "a", x: 90 }), box({ id: "b", y: 90 })], flat);
    expect(issues.map((i) => i.elementId)).toEqual(["a", "b"]);
  });
});
