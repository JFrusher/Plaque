import { describe, expect, it } from "vitest";
import { buildArtefacts } from "../data/artefacts";
import { noFit } from "../template/bindings";
import { defaultCard, defaultSheet, defaultTemplate } from "../template/defaults";
import type { Sheet, Template } from "../types";
import { paginate } from "./paginate";
import {
  hasBackSide,
  interleave,
  mirrorAxisFor,
  mirrorSheet,
  offsetSheet,
  sideOf,
  templateForSide,
} from "./duplex";

const opts = { fitText: noFit, iconPath: () => null };
const rows = [
  { "First Name": "Charis", "Last Name": "Smith" },
  { "First Name": "Tobias", "Last Name": "Ashdown" },
];

function template(): Template {
  const card = defaultCard();
  const base = defaultTemplate(["First Name", "Last Name"], card);
  return {
    ...base,
    elements: [
      ...base.elements,
      { ...base.elements[0]!, id: "back-1", side: "back", x: 5, y: 5 },
    ],
  };
}

function sheetOf(t: Template): Sheet {
  const artefacts = buildArtefacts(rows, { kind: "per-row" }, ["First Name", "Last Name"]);
  const built = paginate(t, artefacts, defaultCard(), defaultSheet(), opts).sheets[0];
  if (!built) throw new Error("no sheet");
  return built;
}

describe("sideOf", () => {
  it("treats an element with no side as front, so old designs still print", () => {
    expect(sideOf({})).toBe("front");
    expect(sideOf({ side: "back" })).toBe("back");
  });
});

describe("templateForSide", () => {
  it("splits one element list into two sides", () => {
    const t = template();
    expect(templateForSide(t, "back").elements.map((e) => e.id)).toEqual(["back-1"]);
    expect(templateForSide(t, "front").elements.every((e) => sideOf(e) === "front")).toBe(true);
    expect(templateForSide(t, "front").elements.length).toBe(t.elements.length - 1);
  });

  it("reports whether there is anything on the back at all", () => {
    expect(hasBackSide(template())).toBe(true);
    expect(hasBackSide(defaultTemplate(["First Name"], defaultCard()))).toBe(false);
  });
});

describe("mirrorAxisFor", () => {
  it("mirrors x for a long-edge flip on a portrait sheet", () => {
    expect(mirrorAxisFor("long", 210, 297)).toBe("x");
    expect(mirrorAxisFor("short", 210, 297)).toBe("y");
  });

  it("swaps with the page shape — the same flip turns about a different line", () => {
    expect(mirrorAxisFor("long", 297, 210)).toBe("y");
    expect(mirrorAxisFor("short", 297, 210)).toBe("x");
  });

  it("treats a square page as portrait rather than guessing", () => {
    expect(mirrorAxisFor("long", 210, 210)).toBe("x");
  });
});

describe("mirrorSheet", () => {
  it("puts a card's back behind its own front", () => {
    const sheet = sheetOf(template());
    const mirrored = mirrorSheet(sheet, "x");
    const front = sheet.cards[0]!;
    const back = mirrored.cards[0]!;
    // Mirrored slot: the right edge of the front footprint measured from the
    // right edge of the page equals the left edge of the mirrored one.
    expect(back.origin.x).toBeCloseTo(210 - front.origin.x - front.footprint.w, 6);
    expect(back.origin.y).toBeCloseTo(front.origin.y, 6);
  });

  it("carries the contents with the card instead of reflecting them", () => {
    const sheet = sheetOf(template());
    const mirrored = mirrorSheet(sheet, "x");
    const before = sheet.cards[0]!.scene.elements[0]!;
    const after = mirrored.cards[0]!.scene.elements[0]!;
    const dx = mirrored.cards[0]!.origin.x - sheet.cards[0]!.origin.x;
    expect(after.x).toBeCloseTo(before.x + dx, 6);
    // Width and rotation untouched: mirrored text would print backwards.
    expect(after.w).toBeCloseTo(before.w, 6);
    expect(after.rotationDeg).toBe(before.rotationDeg);
  });

  it("mirrors on the y axis for a short-edge flip", () => {
    const sheet = sheetOf(template());
    const mirrored = mirrorSheet(sheet, "y");
    const front = sheet.cards[0]!;
    const back = mirrored.cards[0]!;
    expect(back.origin.y).toBeCloseTo(297 - front.origin.y - front.footprint.h, 6);
    expect(back.origin.x).toBeCloseTo(front.origin.x, 6);
  });

  it("mirrors the guides too, or trimming shifts every back", () => {
    const sheet = sheetOf(template());
    const mirrored = mirrorSheet(sheet, "x");
    expect(mirrored.guides.cropMarks.length).toBe(sheet.guides.cropMarks.length);
    const first = sheet.guides.cropMarks[0]!;
    expect(mirrored.guides.cropMarks[0]![0].x).toBeCloseTo(210 - first[0].x, 6);
  });

  it("is its own inverse", () => {
    const sheet = sheetOf(template());
    const twice = mirrorSheet(mirrorSheet(sheet, "x"), "x");
    expect(twice.cards[0]!.origin.x).toBeCloseTo(sheet.cards[0]!.origin.x, 6);
  });
});

describe("offsetSheet", () => {
  it("returns the sheet untouched at zero", () => {
    const sheet = sheetOf(template());
    expect(offsetSheet(sheet, 0, 0)).toBe(sheet);
  });

  it("moves cards, contents and guides together", () => {
    const sheet = sheetOf(template());
    const moved = offsetSheet(sheet, 1.5, -0.5);
    expect(moved.cards[0]!.origin.x).toBeCloseTo(sheet.cards[0]!.origin.x + 1.5, 6);
    expect(moved.cards[0]!.origin.y).toBeCloseTo(sheet.cards[0]!.origin.y - 0.5, 6);
    expect(moved.cards[0]!.scene.elements[0]!.x).toBeCloseTo(
      sheet.cards[0]!.scene.elements[0]!.x + 1.5,
      6,
    );
    expect(moved.guides.cropMarks[0]![0].x).toBeCloseTo(sheet.guides.cropMarks[0]![0].x + 1.5, 6);
  });

  it("does not resize anything — registration drift is a shift, not a scale", () => {
    const sheet = sheetOf(template());
    const moved = offsetSheet(sheet, 2, 2);
    expect(moved.cards[0]!.footprint).toEqual(sheet.cards[0]!.footprint);
    expect(moved.cards[0]!.scene.elements[0]!.w).toBe(sheet.cards[0]!.scene.elements[0]!.w);
  });
});

describe("interleave", () => {
  const stub = (index: number): Sheet => ({
    index,
    pageWidthMm: 210,
    pageHeightMm: 297,
    cards: [],
    guides: { cropMarks: [], cutLines: [], foldGuides: [], bleedBoxes: [] },
  });

  it("alternates front and back and renumbers the pages", () => {
    const out = interleave([stub(0), stub(1)], [stub(0), stub(1)]);
    expect(out.map((s) => s.index)).toEqual([0, 1, 2, 3]);
  });

  it("pads a missing back with a blank rather than shifting the run", () => {
    // A dropped page would put every later card's back on the wrong card.
    const out = interleave([stub(0), stub(1)], [stub(0)]);
    expect(out).toHaveLength(4);
    expect(out[3]?.cards).toEqual([]);
  });

  it("ignores backs with no front", () => {
    expect(interleave([stub(0)], [stub(0), stub(1)])).toHaveLength(2);
  });
});
