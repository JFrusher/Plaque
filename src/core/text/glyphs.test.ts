import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hasGlyph, missingGlyphs, suggestFallback } from "./glyphs";
import { loadFont, splitForBreaking } from "./measure";

const load = (file: string, id: string) =>
  loadFont(id, id, new Uint8Array(readFileSync(`src/assets/fonts/${file}`)));

const crimson = load("CrimsonText-Regular.ttf", "crimson");
const lato = load("Lato-Regular.ttf", "lato");

describe("missingGlyphs", () => {
  it("says nothing about text the face can print", () => {
    expect(missingGlyphs(crimson, "Charis Smith").missing).toEqual([]);
  });

  it("passes an accented name a Latin face supports", () => {
    // "Ellie Ó Braonáin" is the case from discovery, and it must NOT warn.
    expect(missingGlyphs(crimson, "Ellie Ó Braonáin").missing).toEqual([]);
  });

  it("finds characters that would print as tofu", () => {
    const report = missingGlyphs(crimson, "山田太郎");
    expect(report.missing.length).toBeGreaterThan(0);
  });

  it("reports each character once, in the order it appeared", () => {
    const report = missingGlyphs(crimson, "山山田");
    expect(report.missing).toEqual([...new Set(report.missing)]);
  });

  it("ignores whitespace", () => {
    expect(missingGlyphs(crimson, "  \n\t").missing).toEqual([]);
  });
});

describe("hasGlyph", () => {
  it("answers for a single character", () => {
    expect(hasGlyph(crimson, "A")).toBe(true);
    expect(hasGlyph(crimson, "郎")).toBe(false);
  });
});

describe("suggestFallback", () => {
  it("offers a face that can print the missing characters", () => {
    const found = suggestFallback([crimson, lato], ["Ó"], "nothing");
    expect(found).not.toBeNull();
  });

  it("never suggests the face that failed", () => {
    expect(suggestFallback([crimson], ["Ó"], "crimson")).toBeNull();
  });

  it("returns null when nothing loaded can print them", () => {
    expect(suggestFallback([crimson, lato], ["郎"], "crimson")).toBeNull();
  });
});

describe("splitForBreaking (E2)", () => {
  it("splits Latin text at spaces, keeping words whole", () => {
    expect(splitForBreaking("Alexander Wright")).toEqual(["Alexander", "Wright"]);
  });

  it("splits CJK between characters, which is where it may break", () => {
    // Without this a spaceless name is one unbreakable word that overflows.
    expect(splitForBreaking("山田太郎")).toEqual(["山", "田", "太", "郎"]);
  });

  it("keeps Latin runs whole inside mixed text", () => {
    expect(splitForBreaking("山田Smith")).toEqual(["山", "田", "Smith"]);
  });

  it("drops the whitespace it split on", () => {
    expect(splitForBreaking("  a   b ")).toEqual(["a", "b"]);
  });
});
