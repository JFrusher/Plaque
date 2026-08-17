import { describe, expect, it } from "vitest";
import type { CardSpec, IconElement, Template, TextElement } from "../types";
import { noFit, resolveCard, type FitTextFn } from "./bindings";

const card = (over: Partial<CardSpec> = {}): CardSpec => ({
  widthMm: 85,
  heightMm: 110,
  fold: "horizontal",
  foldPositionMm: 55,
  invertBackPanel: true,
  bleedMm: 0,
  ...over,
});

const text = (over: Partial<TextElement> = {}): TextElement => ({
  kind: "text",
  id: "t1",
  x: 10,
  y: 70,
  w: 65,
  h: 20,
  z: 0,
  template: "{{First Name}} {{Last Name}}",
  fontId: "serif",
  fontSizePt: 18,
  align: "center",
  vAlign: "middle",
  lineHeight: 1.2,
  colorHex: "#000000",
  letterSpacingMm: 0,
  fit: { mode: "shrink", minFontSizePt: 8, anchor: "center", maxLines: 1 },
  ...over,
});

const icon = (over: Partial<IconElement> = {}): IconElement => ({
  kind: "icon",
  id: "i1",
  x: 5,
  y: 95,
  w: 8,
  h: 8,
  z: 1,
  sourceField: "Dietary",
  rules: [{ match: "Vegetarian", iconId: "leaf" }],
  fallbackIconId: null,
  colorHex: "#333333",
  ...over,
});

const row = { "First Name": "Charis", "Last Name": "Smith", Dietary: "Vegetarian" };
const paths: Record<string, string> = { leaf: "M12 2 L2 12 L12 22 Z" };
const opts = { fitText: noFit, iconPath: (id: string) => paths[id] ?? null };

describe("resolveCard", () => {
  it("resolves text through the bindings", () => {
    const { scene } = resolveCard({ elements: [text()], backgroundHex: null }, row, card(), opts);
    const el = scene.elements[0];
    expect(el?.kind).toBe("text");
    expect(el?.kind === "text" && el.lines).toEqual(["Charis Smith"]);
  });

  it("resolves an icon to its path", () => {
    const { scene } = resolveCard({ elements: [icon()], backgroundHex: null }, row, card(), opts);
    const el = scene.elements[0];
    expect(el?.kind === "icon" && el.pathD).toBe(paths["leaf"]);
  });

  it("leaves the path null when no rule matches", () => {
    const { scene } = resolveCard(
      { elements: [icon()], backgroundHex: null },
      { ...row, Dietary: "Vegan" },
      card(),
      opts,
    );
    const el = scene.elements[0];
    expect(el?.kind === "icon" && el.pathD).toBeNull();
  });

  it("warns when an icon rule names an icon that is not loaded", () => {
    const { warnings } = resolveCard(
      { elements: [icon({ rules: [{ match: "Vegetarian", iconId: "ghost" }] })], backgroundHex: null },
      row,
      card(),
      opts,
    );
    expect(warnings).toContainEqual({
      elementId: "i1",
      kind: "missing-icon",
      detail: 'Icon "ghost" is not loaded.',
    });
  });

  it("applies fold inversion to back-panel elements only", () => {
    const back = text({ id: "back", x: 10, y: 10, w: 20, h: 10 });
    const front = text({ id: "front", x: 10, y: 70, w: 20, h: 10 });
    const { scene } = resolveCard(
      { elements: [back, front], backgroundHex: null },
      row,
      card(),
      opts,
    );
    const byId = Object.fromEntries(scene.elements.map((e) => [e.id, e]));
    expect(byId["back"]).toMatchObject({ x: 55, y: 35, w: 20, h: 10, rotationDeg: 180 });
    expect(byId["front"]).toMatchObject({ x: 10, y: 70, rotationDeg: 0 });
  });

  it("leaves every element alone when the card does not fold", () => {
    const { scene } = resolveCard(
      { elements: [text({ x: 10, y: 10 })], backgroundHex: null },
      row,
      card({ fold: "none" }),
      opts,
    );
    expect(scene.elements[0]).toMatchObject({ x: 10, y: 10, rotationDeg: 0 });
  });

  it("orders elements by z so the renderers can draw in array order", () => {
    const template: Template = {
      elements: [text({ id: "top", z: 5 }), icon({ id: "bottom", z: 1 })],
      backgroundHex: null,
    };
    const { scene } = resolveCard(template, row, card(), opts);
    expect(scene.elements.map((e) => e.id)).toEqual(["bottom", "top"]);
  });

  it("reports a template token that names no column", () => {
    const { warnings } = resolveCard(
      { elements: [text({ template: "{{Nickname}}" })], backgroundHex: null },
      row,
      card(),
      opts,
    );
    expect(warnings.map((w) => w.kind)).toContain("missing-field");
  });

  it("reports overflow from the fit function", () => {
    const overflowing: FitTextFn = () => ({ lines: ["x"], fontSizePt: 8, overflowed: true });
    const { warnings, scene } = resolveCard(
      { elements: [text()], backgroundHex: null },
      row,
      card(),
      { ...opts, fitText: overflowing },
    );
    expect(warnings.map((w) => w.kind)).toContain("overflow");
    expect(scene.elements[0]).toMatchObject({ overflowed: true, fontSizePt: 8 });
  });

  it("carries the background through", () => {
    const { scene } = resolveCard({ elements: [], backgroundHex: "#fffdf7" }, row, card(), opts);
    expect(scene.backgroundHex).toBe("#fffdf7");
  });

  it("does not mutate the template's element order", () => {
    const elements = [text({ id: "a", z: 9 }), icon({ id: "b", z: 1 })];
    resolveCard({ elements, backgroundHex: null }, row, card(), opts);
    expect(elements.map((e) => e.id)).toEqual(["a", "b"]);
  });
});
