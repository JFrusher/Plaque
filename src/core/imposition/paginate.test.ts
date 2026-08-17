import { describe, expect, it } from "vitest";
import type { CardSpec, SheetSpec, Template, TextElement } from "../types";
import { noFit } from "../template/bindings";
import { buildArtefacts } from "../data/artefacts";
import { paginate } from "./paginate";

const card = (over: Partial<CardSpec> = {}): CardSpec => ({
  widthMm: 85,
  heightMm: 55,
  fold: "none",
  foldPositionMm: 0,
  invertBackPanel: false,
  bleedMm: 0,
  ...over,
});

const sheet = (over: Partial<SheetSpec> = {}): SheetSpec => ({
  page: "A4",
  orientation: "portrait",
  marginTopMm: 10,
  marginRightMm: 10,
  marginBottomMm: 10,
  marginLeftMm: 10,
  gapXMm: 5,
  gapYMm: 5,
  cardRotationDeg: 0,
  printerMarginMm: 5,
  cropMarks: true,
  cutLines: true,
  foldGuides: true,
  bleedGuides: true,
  duplex: false,
  slugLine: false,
  ...over,
});

const nameEl: TextElement = {
  kind: "text",
  id: "name",
  x: 5,
  y: 20,
  w: 75,
  h: 15,
  z: 0,
  template: "{{First Name}} {{Last Name}}",
  fontId: "crimson",
  fontSizePt: 18,
  align: "center",
  vAlign: "middle",
  lineHeight: 1.2,
  colorHex: "#111111",
  letterSpacingMm: 0,
  fit: { mode: "shrink", minFontSizePt: 8, maxLines: 1, anchor: "align" },
};

const template: Template = { elements: [nameEl], backgroundHex: null };
const opts = { fitText: noFit, iconPath: () => null };
/** n place cards: per-row scope, which is what a guest list has always meant. */
const guests = (n: number) =>
  buildArtefacts(
    Array.from({ length: n }, (_, i) => ({ "First Name": `G${i}`, "Last Name": "X" })),
    { kind: "per-row" },
    ["First Name", "Last Name"],
  );

describe("paginate", () => {
  it("fills 8 cards a sheet and rolls onto the next", () => {
    const { sheets, layout } = paginate(template, guests(20), card(), sheet(), opts);
    expect(layout.perSheet).toBe(8);
    expect(sheets).toHaveLength(3);
    expect(sheets[0]?.cards).toHaveLength(8);
    expect(sheets[2]?.cards).toHaveLength(4);
  });

  it("puts 150 guests on 19 sheets", () => {
    expect(paginate(template, guests(150), card(), sheet(), opts).sheets).toHaveLength(19);
  });

  it("numbers guests continuously across sheets", () => {
    const { sheets } = paginate(template, guests(20), card(), sheet(), opts);
    expect(sheets.flatMap((s) => s.cards.map((c) => c.artefactIndex))).toEqual(
      Array.from({ length: 20 }, (_, i) => i),
    );
  });

  it("moves elements into sheet coordinates", () => {
    const { sheets } = paginate(template, guests(1), card(), sheet(), opts);
    // Card 0 sits at (10,10); the element is at (5,20) within it.
    expect(sheets[0]?.cards[0]?.scene.elements[0]).toMatchObject({ x: 15, y: 30 });
  });

  it("adds the sheet's card rotation to each element's own", () => {
    const { sheets } = paginate(template, guests(1), card(), sheet({ cardRotationDeg: 90 }), opts);
    expect(sheets[0]?.cards[0]?.scene.elements[0]?.rotationDeg).toBe(90);
  });

  it("compounds fold inversion with card rotation", () => {
    const tent = card({ heightMm: 110, fold: "horizontal", foldPositionMm: 55, invertBackPanel: true });
    const backEl = { ...nameEl, y: 10, h: 10 };
    const { sheets } = paginate(
      { elements: [backEl], backgroundHex: null },
      guests(1),
      tent,
      sheet({ cardRotationDeg: 90 }),
      opts,
    );
    expect(sheets[0]?.cards[0]?.scene.elements[0]?.rotationDeg).toBe(270);
  });

  it("collects guides for every card on the sheet", () => {
    const { sheets } = paginate(template, guests(8), card(), sheet(), opts);
    expect(sheets[0]?.guides.cropMarks).toHaveLength(8 * 8);
    expect(sheets[0]?.guides.cutLines).toHaveLength(8 * 4);
  });

  it("omits guides that are switched off", () => {
    const { sheets } = paginate(
      template,
      guests(1),
      card(),
      sheet({ cropMarks: false, cutLines: false }),
      opts,
    );
    expect(sheets[0]?.guides.cropMarks).toEqual([]);
    expect(sheets[0]?.guides.cutLines).toEqual([]);
  });

  it("emits one fold guide per card, and none for a flat card", () => {
    const tent = card({ heightMm: 110, fold: "horizontal", foldPositionMm: 55 });
    const folded = paginate(template, guests(4), tent, sheet(), opts);
    expect(folded.sheets[0]?.guides.foldGuides).toHaveLength(4);
    expect(paginate(template, guests(4), card(), sheet(), opts).sheets[0]?.guides.foldGuides).toEqual(
      [],
    );
  });

  it("collects bleed boxes only when the card bleeds", () => {
    const bled = paginate(template, guests(2), card({ bleedMm: 3 }), sheet(), opts);
    expect(bled.sheets[0]?.guides.bleedBoxes).toHaveLength(2);
    expect(paginate(template, guests(2), card(), sheet(), opts).sheets[0]?.guides.bleedBoxes).toEqual(
      [],
    );
  });

  it("tags each warning with the guest it came from", () => {
    const { warnings } = paginate(
      { elements: [{ ...nameEl, template: "{{Nickname}}" }], backgroundHex: null },
      guests(3),
      card(),
      sheet(),
      opts,
    );
    expect(warnings.filter((w) => w.kind === "missing-field").map((w) => w.artefactIndex)).toEqual([
      0, 1, 2,
    ]);
  });

  it("produces nothing rather than throwing when no card fits", () => {
    const { sheets } = paginate(template, guests(5), card({ widthMm: 400 }), sheet(), opts);
    expect(sheets).toEqual([]);
  });

  it("produces nothing for an empty guest list", () => {
    expect(paginate(template, [], card(), sheet(), opts).sheets).toEqual([]);
  });

  it("reports the page size in millimetres on every sheet", () => {
    const { sheets } = paginate(template, guests(9), card(), sheet(), opts);
    for (const s of sheets) {
      expect(s.pageWidthMm).toBe(210);
      expect(s.pageHeightMm).toBe(297);
    }
  });
});
