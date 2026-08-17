import { describe, expect, it } from "vitest";
import type { Template, TextElement } from "../types";
import { DEFAULT_FIT } from "../text/fit";
import {
  hasOverrides,
  orphanedOverrides,
  overriddenRowIds,
  templateForRow,
  withOverride,
  withoutOverride,
} from "./overrides";

const text = (id: string): TextElement => ({
  kind: "text",
  id,
  x: 5,
  y: 5,
  w: 70,
  h: 15,
  z: 0,
  template: "{{First Name}}",
  fontId: "crimson",
  fontSizePt: 18,
  align: "center",
  vAlign: "middle",
  lineHeight: 1.2,
  colorHex: "#111111",
  letterSpacingMm: 0,
  fit: { ...DEFAULT_FIT },
});

const template = (overrides?: Template["overrides"]): Template => ({
  elements: [text("name"), text("table")],
  backgroundHex: null,
  ...(overrides ? { overrides } : {}),
});

describe("templateForRow", () => {
  it("returns the same object when there is nothing to apply", () => {
    // Identity matters: memoised consumers re-render on a new reference.
    const t = template();
    expect(templateForRow(t, "r1")).toBe(t);
    const empty = template({ r1: {} });
    expect(templateForRow(empty, "r1")).toBe(empty);
  });

  it("patches only the named element of the named row", () => {
    const t = template({ r1: { name: { fontSizePt: 12 } } });
    const patched = templateForRow(t, "r1");
    expect((patched.elements[0] as TextElement).fontSizePt).toBe(12);
    expect((patched.elements[1] as TextElement).fontSizePt).toBe(18);
    // Every other row still prints the original design.
    expect((templateForRow(t, "r2").elements[0] as TextElement).fontSizePt).toBe(18);
  });

  it("never mutates the template it was given", () => {
    const t = template({ r1: { name: { fontSizePt: 12 } } });
    templateForRow(t, "r1");
    expect((t.elements[0] as TextElement).fontSizePt).toBe(18);
  });

  it("refuses to change an element's kind", () => {
    // A patch that turned text into an image would make the rest of it nonsense.
    const t = template({ r1: { name: { kind: "image" } as never } });
    expect(templateForRow(t, "r1").elements[0]?.kind).toBe("text");
  });
});

describe("withOverride / withoutOverride", () => {
  it("adds a patch without touching the rest", () => {
    const next = withOverride(undefined, "r1", "name", { fontSizePt: 12 });
    expect(next).toEqual({ r1: { name: { fontSizePt: 12 } } });
  });

  it("merges into an existing patch rather than replacing it", () => {
    const first = withOverride(undefined, "r1", "name", { fontSizePt: 12 });
    const second = withOverride(first, "r1", "name", { w: 60 });
    expect(second["r1"]?.["name"]).toEqual({ fontSizePt: 12, w: 60 });
  });

  it("keeps other rows and elements intact", () => {
    const a = withOverride(undefined, "r1", "name", { fontSizePt: 12 });
    const b = withOverride(a, "r2", "table", { w: 40 });
    expect(Object.keys(b)).toEqual(["r1", "r2"]);
  });

  it("removes one element's patch, and the row entry once it is empty", () => {
    const a = withOverride(undefined, "r1", "name", { fontSizePt: 12 });
    expect(withoutOverride(a, "r1", "name")).toEqual({});
  });

  it("removes a whole row's patches when no element is named", () => {
    let a = withOverride(undefined, "r1", "name", { fontSizePt: 12 });
    a = withOverride(a, "r1", "table", { w: 40 });
    expect(withoutOverride(a, "r1")).toEqual({});
  });

  it("is a no-op for a row that has none", () => {
    expect(withoutOverride(undefined, "r9")).toEqual({});
  });
});

describe("reporting", () => {
  it("knows which rows carry an override", () => {
    const t = template({ r1: { name: { fontSizePt: 12 } }, r2: {} });
    expect(hasOverrides(t, "r1")).toBe(true);
    expect(hasOverrides(t, "r2")).toBe(false);
    expect(overriddenRowIds(t)).toEqual(["r1"]);
  });

  it("reports overrides whose row has gone rather than dropping them", () => {
    // Losing a fix silently is worse than carrying a few dead bytes.
    const t = template({ r1: { name: { fontSizePt: 12 } }, gone: { name: { w: 10 } } });
    expect(orphanedOverrides(t, ["r1", "r3"])).toEqual(["gone"]);
  });
});
