import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUNDLED_FONTS } from "../../assets/fonts";
import { parseCsv } from "../csv/parse";
import { paginate } from "../imposition/paginate";
import { defaultCard, defaultSheet, newId } from "../template/defaults";
import { makeResolveOptions } from "../template/resolve";
import { DEFAULT_FIT } from "../text/fit";
import { loadFont, type LoadedFont } from "../text/measure";
import type {
  CardSpec,
  ListElement,
  ResolvedText,
  Sheet,
  Template,
  TextElement,
} from "../types";
import { buildArtefacts } from "./artefacts";

/**
 * The Phase C exit test.
 *
 * > One dataset produces place cards, table numbers, a table menu and a kitchen
 * > run-sheet, with no new rendering code.
 *
 * Everything below goes through the same `paginate` and comes out as the same
 * `Sheet` the two renderers already consume. If this file ever needs a renderer
 * change to pass, the row-scope design has failed.
 */
const fonts = new Map<string, LoadedFont>(
  BUNDLED_FONTS.slice(0, 1).map((f) => [
    f.id,
    loadFont(f.id, f.family, new Uint8Array(readFileSync(`src/assets/fonts/${f.file}`))),
  ]),
);
const FONT_ID = BUNDLED_FONTS[0]!.id;
const resolveOptions = makeResolveOptions(fonts);

const { headers, rows } = parseCsv(readFileSync("fixtures/guests-150.csv", "utf8"));

const text = (over: Partial<TextElement>): TextElement => ({
  kind: "text",
  id: newId(),
  x: 5,
  y: 5,
  w: 75,
  h: 15,
  z: 0,
  template: "{{First Name}}",
  fontId: FONT_ID,
  fontSizePt: 18,
  align: "center",
  vAlign: "middle",
  lineHeight: 1.2,
  colorHex: "#111111",
  letterSpacingMm: 0,
  fit: { ...DEFAULT_FIT },
  ...over,
});

const list = (over: Partial<ListElement>): ListElement => ({
  kind: "list",
  id: newId(),
  x: 5,
  y: 25,
  w: 75,
  h: 60,
  z: 1,
  itemTemplate: "{{First Name}} {{Last Name}}",
  bullet: "",
  skipEmpty: true,
  fontId: FONT_ID,
  fontSizePt: 10,
  align: "left",
  vAlign: "top",
  lineHeight: 1.3,
  colorHex: "#111111",
  letterSpacingMm: 0,
  fit: { ...DEFAULT_FIT, mode: "shrink", minFontSizePt: 5 },
  ...over,
});

function build(template: Template, card: CardSpec = defaultCard(), subset = rows) {
  const artefacts = buildArtefacts(subset, template.rowScope ?? { kind: "per-row" }, headers);
  return paginate(template, artefacts, card, defaultSheet(), resolveOptions);
}

const linesOf = (sheets: Sheet[], cardIndex = 0): string[][] =>
  (sheets[0]?.cards[cardIndex]?.scene.elements ?? [])
    .filter((el): el is ResolvedText => el.kind === "text")
    .map((el) => el.lines);

describe("one dataset, four artefacts (Phase C exit test)", () => {
  it("place cards: one per guest", () => {
    const { sheets } = build({
      elements: [text({ template: "{{First Name}} {{Last Name}}" })],
      backgroundHex: null,
      rowScope: { kind: "per-row" },
    });
    const cards = sheets.flatMap((s) => s.cards);
    expect(cards).toHaveLength(rows.length);
    expect(linesOf(sheets)[0]).toEqual([`${rows[0]!["First Name"]} ${rows[0]!["Last Name"]}`]);
  });

  it("table number cards: one per table, numbered from the group's own rows", () => {
    const { sheets } = build({
      elements: [text({ template: "Table {{Table}}", fontSizePt: 30 })],
      backgroundHex: null,
      rowScope: { kind: "per-group", byColumn: "Table" },
    });
    const cards = sheets.flatMap((s) => s.cards);
    const tables = new Set(rows.map((r) => r["Table"]));
    expect(cards).toHaveLength(tables.size);
    expect(cards.length).toBeLessThan(rows.length);
    expect(linesOf(sheets)[0]?.[0]).toMatch(/^Table /);
  });

  it("table menu: one per table, listing that table's guests and their meals", () => {
    const { sheets } = build(
      {
        elements: [
          text({ template: "Table {{Table}}" }),
          list({ itemTemplate: "{{First Name}} {{Last Name}} — {{Dietary}}", bullet: "·" }),
        ],
        backgroundHex: null,
        rowScope: { kind: "per-group", byColumn: "Table" },
      },
      { ...defaultCard(), widthMm: 85, heightMm: 110 },
    );

    const firstTable = rows[0]!["Table"];
    const guestsOnIt = rows.filter((r) => r["Table"] === firstTable);
    const menuLines = linesOf(sheets)[1] ?? [];
    expect(menuLines).toHaveLength(guestsOnIt.length);
    expect(menuLines[0]).toContain(guestsOnIt[0]!["First Name"]!);
    expect(menuLines[0]!.startsWith("·")).toBe(true);
  });

  it("kitchen run-sheet: one document listing every guest", () => {
    // A run-sheet for the whole event is one artefact, so it has to fit one
    // card. 150 rows do not fit an A4 page at a legible size — see the note on
    // buildArtefacts — so the exit test uses a service-sized list and asserts
    // the fit, rather than claiming a sheet that would print unreadably.
    const { sheets, warnings } = build(
      {
        elements: [
          text({ template: "Kitchen run-sheet" }),
          list({
            itemTemplate: "{{Table}} · {{First Name}} {{Last Name}} · {{Dietary}}",
            h: 250,
            fit: { ...DEFAULT_FIT, mode: "shrink", minFontSizePt: 4 },
          }),
        ],
        backgroundHex: null,
        rowScope: { kind: "document" },
      },
      { ...defaultCard(), widthMm: 190, heightMm: 277 },
      rows.slice(0, 60),
    );

    expect(sheets).toHaveLength(1);
    expect(sheets[0]!.cards).toHaveLength(1);
    expect(linesOf(sheets)[1]).toHaveLength(60);
    // And it actually fits: a run-sheet shrunk past legibility is not a
    // run-sheet, so the exit test asserts the fit rather than the line count.
    expect(warnings.filter((w) => w.kind === "overflow")).toEqual([]);
  });

  it("every artefact resolves to the same Sheet shape the renderers already take", () => {
    // The actual claim of the exit test: no new rendering code. A list element
    // leaves core as resolved TEXT, so nothing downstream learned a new kind.
    const { sheets } = build({
      elements: [text({}), list({})],
      backgroundHex: null,
      rowScope: { kind: "document" },
    });
    const kinds = new Set(sheets[0]!.cards[0]!.scene.elements.map((el) => el.kind));
    expect([...kinds]).toEqual(["text"]);
  });

  it("a design with no scope still prints one card per row", () => {
    // Every project file written before row scope existed.
    const { sheets } = build({ elements: [text({})], backgroundHex: null });
    expect(sheets.flatMap((s) => s.cards)).toHaveLength(rows.length);
  });
});

describe("per-row overrides reach the sheet (D1)", () => {
  it("prints one row smaller without touching any other", () => {
    const nameEl = text({ template: "{{First Name}}", fontSizePt: 20 });
    const artefacts = buildArtefacts(rows, { kind: "per-row" }, headers);
    const template: Template = {
      elements: [nameEl],
      backgroundHex: null,
      overrides: { [artefacts[1]!.rowId]: { [nameEl.id]: { fontSizePt: 9 } } },
    };

    const sheets = paginate(template, artefacts, defaultCard(), defaultSheet(), resolveOptions).sheets;
    const sizeOf = (slot: number) =>
      (sheets[0]!.cards[slot]!.scene.elements[0] as ResolvedText).fontSizePt;

    expect(sizeOf(1)).toBe(9);
    expect(sizeOf(0)).toBe(20);
    expect(sizeOf(2)).toBe(20);
  });

  it("follows its row when the scope changes, rather than a position", () => {
    const nameEl = text({ template: "{{Table}}" });
    const perRow = buildArtefacts(rows, { kind: "per-row" }, headers);
    // Override the row that happens to lead the second table.
    const target = perRow.find((a) => a.row["Table"] !== rows[0]!["Table"])!;
    const template: Template = {
      elements: [nameEl],
      backgroundHex: null,
      overrides: { [target.rowId]: { [nameEl.id]: { fontSizePt: 7 } } },
    };

    const grouped = buildArtefacts(rows, { kind: "per-group", byColumn: "Table" }, headers);
    const sheets = paginate(template, grouped, defaultCard(), defaultSheet(), resolveOptions).sheets;
    const patched = sheets[0]!.cards.filter(
      (c) => (c.scene.elements[0] as ResolvedText).fontSizePt === 7,
    );
    // Exactly the group whose leading row carries the override.
    expect(patched).toHaveLength(1);
  });
});
