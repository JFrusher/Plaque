import { describe, expect, it } from "vitest";
import { panelOf } from "../geometry/fold";
import { resolveIconId } from "./icons";
import type { CardSpec } from "../types";
import { defaultCard, defaultIconRules, defaultSheet, defaultTemplate } from "./defaults";

const headers = ["First Name", "Last Name", "Table", "Dietary", "Entree"];

const tent = (): CardSpec => ({
  ...defaultCard(),
  heightMm: 110,
  fold: "horizontal",
  foldPositionMm: 55,
  invertBackPanel: true,
});

describe("defaults", () => {
  it("starts on an 85x55 flat card and an A4 sheet", () => {
    expect(defaultCard()).toMatchObject({ widthMm: 85, heightMm: 55, fold: "none" });
    expect(defaultSheet()).toMatchObject({ page: "A4", orientation: "portrait" });
  });

  it("maps every spelling a guest list is likely to use", () => {
    const rules = defaultIconRules();
    expect(rules).toContainEqual({ match: "Vegetarian", iconId: "vegetarian" });
    // The spellings that a label-only rule set would have missed.
    expect(rules).toContainEqual({ match: "Gluten-Free", iconId: "gluten-free" });
    expect(rules).toContainEqual({ match: "Dairy-Free", iconId: "dairy-free" });
    expect(rules).toContainEqual({ match: "Nut-Free", iconId: "nut-free" });
  });

  it("resolves every dietary value in the sample fixtures", () => {
    const rules = defaultIconRules();
    const values = ["Vegetarian", "Vegan", "Gluten-Free", "Dairy-Free", "Nut-Free", "Halal", "Kosher", "Child"];
    for (const value of values) {
      expect(resolveIconId(value, rules, null)).not.toBeNull();
    }
    expect(resolveIconId("None", rules, null)).toBeNull();
  });
});

describe("defaultTemplate", () => {
  it("renders something on a flat card the moment a CSV lands", () => {
    const t = defaultTemplate(headers);
    expect(t.elements.length).toBeGreaterThan(0);
    const first = t.elements[0];
    expect(first?.kind).toBe("text");
    expect(first?.kind === "text" && first.template).toBe("{{First Name}} {{Last Name}}");
  });

  it("keeps every element inside the card", () => {
    const card = defaultCard();
    for (const el of defaultTemplate(headers, card).elements) {
      expect(el.x).toBeGreaterThanOrEqual(0);
      expect(el.y).toBeGreaterThanOrEqual(0);
      expect(el.x + el.w).toBeLessThanOrEqual(card.widthMm);
      expect(el.y + el.h).toBeLessThanOrEqual(card.heightMm);
    }
  });

  it("fills both panels of a folded card, so the table across can read it too", () => {
    const card = tent();
    const elements = defaultTemplate(headers, card).elements;
    const panels = elements.map((el) => panelOf({ x: el.x, y: el.y, w: el.w, h: el.h }, card));
    expect(panels).toContain("front");
    expect(panels).toContain("back");
    expect(elements.filter((el) => el.kind === "text" && el.template.includes("First Name"))).toHaveLength(2);
  });

  it("keeps folded-card elements inside their own panel", () => {
    const card = tent();
    for (const el of defaultTemplate(headers, card).elements) {
      const top = el.y;
      const bottom = el.y + el.h;
      const crossesFold = top < card.foldPositionMm && bottom > card.foldPositionMm;
      expect(crossesFold).toBe(false);
    }
  });

  it("omits the table line and the icon when the CSV has no such columns", () => {
    const t = defaultTemplate(["Name"]);
    expect(t.elements).toHaveLength(1);
    expect(t.elements.every((el) => el.kind === "text")).toBe(true);
  });

  it("gives every element a distinct id", () => {
    const ids = defaultTemplate(headers, tent()).elements.map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("assigns z in draw order", () => {
    const zs = defaultTemplate(headers, tent()).elements.map((el) => el.z);
    expect(zs).toEqual([...zs].sort((a, b) => a - b));
  });
});
