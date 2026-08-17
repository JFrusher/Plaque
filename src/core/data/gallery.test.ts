import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUNDLED_FONTS } from "../../assets/fonts";
import { parseCsv } from "../csv/parse";
import { hasErrors, validateGeometry } from "../geometry/validate";
import { paginate } from "../imposition/paginate";
import { defaultCard, defaultSheet } from "../template/defaults";
import { makeResolveOptions } from "../template/resolve";
import { unboundTokens } from "../template/rebind";
import { loadFont, type LoadedFont } from "../text/measure";
import { buildArtefacts } from "./artefacts";
import { GALLERY, validateGalleryTemplate } from "./gallery";

/**
 * The gallery doubles as the test corpus (F2). Every shipped design is built
 * against the real fixture data with the real fitter — a template that no longer
 * renders fails here rather than on someone's card stock.
 */
const fonts = new Map<string, LoadedFont>(
  BUNDLED_FONTS.map((f) => [
    f.id,
    loadFont(f.id, f.family, new Uint8Array(readFileSync(`src/assets/fonts/${f.file}`))),
  ]),
);
const resolveOptions = makeResolveOptions(fonts);
const { headers, rows } = parseCsv(readFileSync("fixtures/guests-150.csv", "utf8"));

describe("the template gallery", () => {
  it("ships some", () => {
    expect(GALLERY.length).toBeGreaterThan(0);
  });

  it("has unique ids and names", () => {
    expect(new Set(GALLERY.map((t) => t.id)).size).toBe(GALLERY.length);
    expect(new Set(GALLERY.map((t) => t.name)).size).toBe(GALLERY.length);
  });

  it("validates every entry", () => {
    for (const entry of GALLERY) {
      expect([entry.id, validateGalleryTemplate(entry)]).toEqual([entry.id, null]);
    }
  });

  it("names only fonts that ship with Plaque", () => {
    // A gallery template referencing an uploaded font would be broken on arrival.
    for (const entry of GALLERY) {
      for (const el of entry.template.elements) {
        if (el.kind !== "text" && el.kind !== "list") continue;
        expect([entry.id, fonts.has(el.fontId)]).toEqual([entry.id, true]);
      }
    }
  });

  it("binds only to columns the sample guest list actually has", () => {
    for (const entry of GALLERY) {
      expect([entry.id, unboundTokens(entry.template, headers)]).toEqual([entry.id, []]);
    }
  });

  it("produces a geometry the validator is happy with", () => {
    for (const entry of GALLERY) {
      const card = { ...defaultCard(), ...entry.card };
      expect([entry.id, hasErrors(validateGeometry(card, defaultSheet()))]).toEqual([
        entry.id,
        false,
      ]);
    }
  });

  it("renders real cards from the fixture data", () => {
    for (const entry of GALLERY) {
      const card = { ...defaultCard(), ...entry.card };
      const artefacts = buildArtefacts(rows, entry.template.rowScope ?? { kind: "per-row" }, headers);
      const { sheets } = paginate(entry.template, artefacts, card, defaultSheet(), resolveOptions);

      const cards = sheets.flatMap((s) => s.cards);
      expect([entry.id, cards.length > 0]).toEqual([entry.id, true]);

      // Something must actually be on the card: an element list that resolves to
      // nothing is a blank sheet of expensive stock.
      const drew = cards[0]!.scene.elements.some(
        (el) => (el.kind === "text" && el.lines.length > 0) || el.kind !== "text",
      );
      expect([entry.id, drew]).toEqual([entry.id, true]);
    }
  });

  it("fits its text without falling to the floor", () => {
    // A shipped design that overflows on the sample data is a bad example.
    for (const entry of GALLERY) {
      const card = { ...defaultCard(), ...entry.card };
      const artefacts = buildArtefacts(rows, entry.template.rowScope ?? { kind: "per-row" }, headers);
      const { warnings } = paginate(entry.template, artefacts, card, defaultSheet(), resolveOptions);
      expect([entry.id, warnings.filter((w) => w.kind === "overflow")]).toEqual([entry.id, []]);
    }
  });
});

describe("validateGalleryTemplate", () => {
  const good = () => structuredClone(GALLERY[0]!) as unknown as Record<string, unknown>;

  it("names the field that is wrong", () => {
    expect(validateGalleryTemplate({ ...good(), format: "nope" })).toBe("format");
    expect(validateGalleryTemplate({ ...good(), version: 99 })).toBe("version");
    expect(validateGalleryTemplate({ ...good(), name: "" })).toBe("name");
    expect(validateGalleryTemplate(null)).toBe("not an object");
  });

  it("rejects a design with no elements, which would print blank cards", () => {
    const empty = { ...good(), template: { elements: [], backgroundHex: null } };
    expect(validateGalleryTemplate(empty)).toBe("template.elements");
  });

  it("names the offending element and field", () => {
    const entry = good();
    const template = entry["template"] as { elements: Record<string, unknown>[] };
    const broken = {
      ...entry,
      template: { ...template, elements: [{ ...template.elements[0], x: "8" }] },
    };
    expect(validateGalleryTemplate(broken)).toBe("template.elements[0].x");
  });
});
