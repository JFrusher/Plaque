import { describe, expect, it } from "vitest";
import type { CardElement } from "../types";
import { defaultCard } from "./defaults";
import { ELEMENT_KINDS, describeElement, elementKind } from "./registry";

const context = { id: "e1", z: 3, card: defaultCard(), headers: ["First Name", "Table"] };

describe("the element registry", () => {
  it("covers every kind in the union exactly once", () => {
    // The renderers switch on `kind` and TypeScript enforces exhaustiveness
    // there; this catches a kind that exists in the type but has no palette
    // entry, which would make it unreachable rather than undrawable.
    const kinds = ELEMENT_KINDS.map((spec) => spec.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    const expected: CardElement["kind"][] = ["text", "list", "icon", "image", "rect", "line"];
    expect([...kinds].sort()).toEqual([...expected].sort());
  });

  it("creates an element carrying the id and z it was given", () => {
    for (const spec of ELEMENT_KINDS) {
      const element = spec.create(context);
      expect([spec.kind, element.id, element.z, element.kind]).toEqual([
        spec.kind,
        "e1",
        3,
        spec.kind,
      ]);
    }
  });

  it("puts every new element inside the card", () => {
    const card = defaultCard();
    for (const spec of ELEMENT_KINDS) {
      const el = spec.create(context);
      expect([spec.kind, el.x >= 0 && el.x + el.w <= card.widthMm]).toEqual([spec.kind, true]);
      expect([spec.kind, el.y >= 0 && el.y + el.h <= card.heightMm]).toEqual([spec.kind, true]);
    }
  });

  it("binds the first column where a kind reads data", () => {
    const text = ELEMENT_KINDS.find((s) => s.kind === "text")!.create(context);
    expect(text.kind === "text" && text.template).toBe("{{First Name}}");
    const icon = ELEMENT_KINDS.find((s) => s.kind === "icon")!.create(context);
    expect(icon.kind === "icon" && icon.sourceField).toBe("First Name");
  });

  it("still produces something usable with no CSV loaded", () => {
    for (const spec of ELEMENT_KINDS) {
      const el = spec.create({ ...context, headers: [] });
      expect([spec.kind, el.w > 0 && el.h > 0]).toEqual([spec.kind, true]);
    }
  });

  it("describes every kind for the layer list", () => {
    for (const spec of ELEMENT_KINDS) {
      expect([spec.kind, describeElement(spec.create(context))]).not.toEqual([spec.kind, ""]);
    }
  });

  it("looks a kind up, and admits when it does not know one", () => {
    expect(elementKind("text")?.label).toBe("Text");
    expect(elementKind("nope" as CardElement["kind"])).toBeUndefined();
  });
});
