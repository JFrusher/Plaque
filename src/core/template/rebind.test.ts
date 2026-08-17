import { describe, expect, it } from "vitest";
import { DEFAULT_FIT } from "../text/fit";
import type { IconElement, ListElement, Template, TextElement } from "../types";
import { rebindTemplate, unboundTokens } from "./rebind";

const text = (template: string, id = "t1"): TextElement => ({
  kind: "text",
  id,
  x: 0,
  y: 0,
  w: 70,
  h: 15,
  z: 0,
  template,
  fontId: "crimson",
  fontSizePt: 18,
  align: "center",
  vAlign: "middle",
  lineHeight: 1.2,
  colorHex: "#111111",
  letterSpacingMm: 0,
  fit: { ...DEFAULT_FIT },
});

const icon = (sourceField: string): IconElement => ({
  kind: "icon",
  id: "i1",
  x: 0,
  y: 0,
  w: 8,
  h: 8,
  z: 1,
  sourceField,
  rules: [],
  fallbackIconId: null,
  colorHex: "#333333",
});

const list = (itemTemplate: string): ListElement => ({
  kind: "list",
  id: "l1",
  x: 0,
  y: 20,
  w: 70,
  h: 40,
  z: 2,
  itemTemplate,
  bullet: "",
  skipEmpty: true,
  fontId: "crimson",
  fontSizePt: 10,
  align: "left",
  vAlign: "top",
  lineHeight: 1.3,
  colorHex: "#111111",
  letterSpacingMm: 0,
  fit: { ...DEFAULT_FIT },
});

const OLD = ["First Name", "Last Name", "Table", "Dietary"];
const NEW = ["Guest First", "Guest Last", "Tbl", "Dietary Needs"];

const template = (elements: Template["elements"], rowScope?: Template["rowScope"]): Template => ({
  elements,
  backgroundHex: null,
  ...(rowScope ? { rowScope } : {}),
});

describe("rebindTemplate", () => {
  it("re-attaches tokens by role, not by literal header", () => {
    const result = rebindTemplate(
      template([text("{{First Name}} {{Last Name}}")]),
      OLD,
      NEW,
    );
    expect((result.template.elements[0] as TextElement).template).toBe(
      "{{Guest First}} {{Guest Last}}",
    );
    expect(result.unmatched).toEqual([]);
    expect(result.renamed).toMatchObject({ "First Name": "Guest First" });
  });

  it("leaves a token alone when the same column still exists", () => {
    const result = rebindTemplate(template([text("{{Table}}")]), OLD, ["Table", "Guest First"]);
    expect((result.template.elements[0] as TextElement).template).toBe("{{Table}}");
    expect(result.renamed).toEqual({});
  });

  it("matches a column that only changed case", () => {
    const result = rebindTemplate(template([text("{{Table}}")]), OLD, ["TABLE"]);
    expect((result.template.elements[0] as TextElement).template).toBe("{{TABLE}}");
  });

  it("does not map one role onto another", () => {
    // "Dietary" and "Meal" are different questions; binding one to the other
    // would print an allergy where a main course should be.
    const result = rebindTemplate(template([text("{{Dietary}}")]), OLD, ["Meal"]);
    expect(result.unmatched).toEqual(["Dietary"]);
  });

  it("reports a token it cannot match instead of guessing", () => {
    // A token quietly pointed at the wrong column prints the wrong guest.
    const result = rebindTemplate(template([text("{{Nickname}}")]), OLD, NEW);
    expect(result.unmatched).toEqual(["Nickname"]);
    expect((result.template.elements[0] as TextElement).template).toBe("{{Nickname}}");
  });

  it("rebinds an icon's source column", () => {
    const result = rebindTemplate(template([icon("Dietary")]), OLD, NEW);
    expect((result.template.elements[0] as IconElement).sourceField).toBe("Dietary Needs");
  });

  it("rebinds a list's per-row template", () => {
    const result = rebindTemplate(template([list("{{First Name}} — {{Dietary}}")]), OLD, NEW);
    expect((result.template.elements[0] as ListElement).itemTemplate).toBe(
      "{{Guest First}} — {{Dietary Needs}}",
    );
  });

  it("follows the grouping column, or every group silently collapses into one", () => {
    const result = rebindTemplate(
      template([text("{{Table}}")], { kind: "per-group", byColumn: "Table" }),
      OLD,
      NEW,
    );
    expect(result.template.rowScope).toEqual({ kind: "per-group", byColumn: "Tbl" });
  });

  it("reports an unmatched grouping column rather than dropping the scope", () => {
    const result = rebindTemplate(
      template([text("x")], { kind: "per-group", byColumn: "Region" }),
      OLD,
      NEW,
    );
    expect(result.unmatched).toContain("Region");
    expect(result.template.rowScope).toEqual({ kind: "per-group", byColumn: "Region" });
  });

  it("leaves literal text and other element kinds untouched", () => {
    const result = rebindTemplate(template([text("Table of honour")]), OLD, NEW);
    expect((result.template.elements[0] as TextElement).template).toBe("Table of honour");
  });
});

describe("unboundTokens", () => {
  it("lists tokens with no column, which is what blocks export", () => {
    const t = template([text("{{First Name}} {{Nickname}}"), icon("Gone")]);
    expect(unboundTokens(t, ["First Name"]).sort()).toEqual(["Gone", "Nickname"]);
  });

  it("says nothing when everything resolves", () => {
    expect(unboundTokens(template([text("{{Table}}")]), ["Table"])).toEqual([]);
  });
});
