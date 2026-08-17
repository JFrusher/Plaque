import { describe, expect, it } from "vitest";
import type { IconRule } from "../types";
import { distinctValues, resolveIconForRow, resolveIconId, unmappedValues } from "./icons";

const rules: IconRule[] = [
  { match: "Vegetarian", iconId: "leaf" },
  { match: "Gluten-Free", iconId: "wheat" },
];

describe("resolveIconId", () => {
  it("matches ignoring case and surrounding space", () => {
    expect(resolveIconId("gluten-free", rules, null)).toBe("wheat");
    expect(resolveIconId("  Gluten-Free  ", rules, null)).toBe("wheat");
    expect(resolveIconId("GLUTEN-FREE", rules, null)).toBe("wheat");
  });

  it("does not match loosely — a near miss must not pick an icon", () => {
    expect(resolveIconId("Gluten Free", rules, null)).toBeNull();
    expect(resolveIconId("Vegan", rules, null)).toBeNull();
  });

  it("uses the fallback when nothing matches", () => {
    expect(resolveIconId("Vegan", rules, "dot")).toBe("dot");
  });

  it("uses the fallback for an empty cell", () => {
    expect(resolveIconId("", rules, "dot")).toBe("dot");
    expect(resolveIconId("   ", rules, null)).toBeNull();
  });

  it("takes the first matching rule", () => {
    const dupes: IconRule[] = [
      { match: "Vegan", iconId: "first" },
      { match: "vegan", iconId: "second" },
    ];
    expect(resolveIconId("Vegan", dupes, null)).toBe("first");
  });
});

describe("resolveIconForRow", () => {
  it("reads the named column", () => {
    expect(resolveIconForRow({ Dietary: "Vegetarian" }, "Dietary", rules, null)).toBe("leaf");
  });

  it("treats a missing column as empty", () => {
    expect(resolveIconForRow({}, "Dietary", rules, "dot")).toBe("dot");
  });
});

describe("column summaries", () => {
  const rows = [
    { Dietary: "Vegetarian" },
    { Dietary: "vegetarian" },
    { Dietary: "Vegan" },
    { Dietary: "" },
    { Dietary: "Gluten-Free" },
  ];

  it("lists distinct values once, sorted, keeping first-seen casing", () => {
    expect(distinctValues(rows, "Dietary")).toEqual(["Gluten-Free", "Vegan", "Vegetarian"]);
  });

  it("names the values that would print no icon", () => {
    expect(unmappedValues(rows, "Dietary", rules, null)).toEqual(["Vegan"]);
  });

  it("reports nothing unmapped once a fallback exists", () => {
    expect(unmappedValues(rows, "Dietary", rules, "dot")).toEqual([]);
  });
});
