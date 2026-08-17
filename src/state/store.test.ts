import { beforeEach, describe, expect, it } from "vitest";
import { HISTORY_LIMIT } from "./history";
import { usePlaque } from "./store";

const HEADERS = ["First Name", "Last Name", "Table", "Dietary"];
const ROWS = [
  { "First Name": "Charis", "Last Name": "Smith", Table: "Table 1", Dietary: "Vegetarian" },
  { "First Name": "Eleanor", "Last Name": "Vane", Table: "Table 2", Dietary: "Vegan" },
];

const csv = () => ({ headers: HEADERS, rows: ROWS, issues: [], fileName: "guests.csv" });
const state = () => usePlaque.getState();

beforeEach(() => {
  state().clearAll();
});

describe("first upload", () => {
  it("starts with no elements, so the default template is not built against columns that do not exist", () => {
    expect(state().template.elements).toEqual([]);
  });

  it("lays out a real template as soon as a CSV lands", () => {
    state().setCsv(csv());
    const elements = state().template.elements;
    expect(elements.length).toBeGreaterThan(0);
    const text = elements.find((el) => el.kind === "text");
    expect(text?.kind === "text" && text.template).toBe("{{First Name}} {{Last Name}}");
  });

  it("never overwrites a design the user has already made", () => {
    state().setCsv(csv());
    state().addElement("rect");
    const before = state().template.elements.map((el) => el.id);
    state().setCsv({ ...csv(), headers: ["Name"], fileName: "other.csv" });
    expect(state().template.elements.map((el) => el.id)).toEqual(before);
  });
});

describe("elements", () => {
  it("selects what it adds", () => {
    state().addElement("text");
    expect(state().selectedId).toBe(state().template.elements[0]?.id);
  });

  it("puts a duplicate on top and offset from its source", () => {
    state().addElement("rect");
    const source = state().template.elements[0]!;
    state().duplicateElement(source.id);
    const copy = state().template.elements[1]!;
    expect(copy.id).not.toBe(source.id);
    expect(copy.x).toBe(source.x + 3);
    expect(copy.z).toBeGreaterThan(source.z);
  });

  it("clears the selection when the selected element is deleted", () => {
    state().addElement("text");
    const id = state().selectedId!;
    state().removeElement(id);
    expect(state().selectedId).toBeNull();
    expect(state().template.elements).toEqual([]);
  });

  it("raises and lowers z", () => {
    state().addElement("text");
    state().addElement("rect");
    const [first, second] = state().template.elements;
    state().raiseElement(first!.id);
    expect(state().template.elements[0]!.z).toBeGreaterThan(state().template.elements[1]!.z);
    state().lowerElement(first!.id);
    expect(state().template.elements[0]!.z).toBeLessThan(second!.z);
  });
});

describe("undo", () => {
  it("steps back through changes", () => {
    state().setCard({ widthMm: 100 });
    state().setCard({ widthMm: 120 });
    state().undo();
    expect(state().card.widthMm).toBe(100);
    state().undo();
    expect(state().card.widthMm).toBe(85);
  });

  it("redoes what it undid", () => {
    state().setCard({ widthMm: 100 });
    state().undo();
    state().redo();
    expect(state().card.widthMm).toBe(100);
  });

  it("drops the redo stack once a new change is made", () => {
    state().setCard({ widthMm: 100 });
    state().undo();
    state().setCard({ widthMm: 70 });
    state().redo();
    expect(state().card.widthMm).toBe(70);
  });

  it("does nothing at the ends of history", () => {
    expect(() => state().undo()).not.toThrow();
    expect(() => state().redo()).not.toThrow();
    expect(state().card.widthMm).toBe(85);
  });

  it("records one entry for a whole drag, not one per frame", () => {
    state().addElement("rect");
    const id = state().selectedId!;
    const depth = state().past.length;

    state().beginEdit();
    for (let i = 0; i < 50; i++) state().setElementBox(id, { x: i, y: i, w: 10, h: 10 });

    expect(state().past).toHaveLength(depth + 1);
    state().undo();
    expect(state().template.elements[0]!.x).not.toBe(49);
  });

  it("forgets the oldest entries past the limit rather than growing without bound", () => {
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) state().setCard({ widthMm: 50 + i });
    expect(state().past.length).toBeLessThanOrEqual(HISTORY_LIMIT);
  });
});

describe("card and sheet", () => {
  it("recentres the fold when the fold axis changes", () => {
    state().setCard({ widthMm: 85, heightMm: 110 });
    state().setCard({ fold: "horizontal" });
    expect(state().card.foldPositionMm).toBe(55);
    state().setCard({ fold: "vertical" });
    expect(state().card.foldPositionMm).toBe(42.5);
  });

  it("returns to sheet one whenever the layout changes underneath", () => {
    state().setCsv(csv());
    state().setPage(3);
    state().setSheet({ gapXMm: 8 });
    expect(state().page).toBe(0);
  });
});

describe("fonts", () => {
  it("moves elements off a font that is removed rather than leaving them blank", () => {
    state().setCsv(csv());
    const font = { id: "user:x", family: "X" } as never;
    state().addFont(font, "X");
    const textEl = state().template.elements.find((el) => el.kind === "text")!;
    state().updateElement(textEl.id, { fontId: "user:x" });
    state().removeFont("user:x");
    const after = state().template.elements.find((el) => el.id === textEl.id)!;
    expect(after.kind === "text" && after.fontId).toBe("crimson");
    expect(state().fonts.has("user:x")).toBe(false);
  });
});

describe("clearAll", () => {
  it("wipes the guest list, the design and the history", () => {
    state().setCsv(csv());
    state().addElement("rect");
    state().clearAll();
    expect(state().rows).toEqual([]);
    expect(state().headers).toEqual([]);
    expect(state().template.elements).toEqual([]);
    expect(state().past).toEqual([]);
    expect(state().fileName).toBeNull();
  });
});

describe("combining rows (S-I.3)", () => {
  const threeRows = () => ({
    headers: HEADERS,
    rows: [
      ...ROWS,
      { "First Name": "Tobias", "Last Name": "Ashdown", Table: "Table 1", Dietary: "" },
    ],
    issues: [],
    fileName: "guests.csv",
  });

  it("gives every row an id, so an override can outlive a re-order", () => {
    state().setCsv(csv());
    expect(state().rowIds).toHaveLength(ROWS.length);
    expect(new Set(state().rowIds).size).toBe(ROWS.length);
  });

  it("joins two guests onto one row and drops the originals from the list", () => {
    state().setCsv(threeRows());
    state().combineRows([0, 2]);
    expect(state().rows).toHaveLength(2);
    expect(state().rows[0]?.["First Name"]).toBe("Charis & Tobias");
  });

  it("says a shared value once rather than repeating it", () => {
    state().setCsv(threeRows());
    state().combineRows([0, 2]);
    // Both are on Table 1; the card should not read "Table 1 & Table 1".
    expect(state().rows[0]?.["Table"]).toBe("Table 1");
  });

  it("puts the combined row where the first of its sources was", () => {
    state().setCsv(threeRows());
    state().combineRows([1, 2]);
    expect(state().rows[0]?.["First Name"]).toBe("Charis");
    expect(state().rows[1]?.["First Name"]).toBe("Eleanor & Tobias");
  });

  it("restores the originals exactly when split again", () => {
    state().setCsv(threeRows());
    const before = state().rows;
    const beforeIds = state().rowIds;
    state().combineRows([0, 2]);
    state().splitRow(state().rowIds[0]!);
    expect(state().rows).toEqual(before);
    expect(state().rowIds).toEqual(beforeIds);
    expect(state().merged).toEqual({});
  });

  it("refuses to combine fewer than two rows", () => {
    state().setCsv(csv());
    state().combineRows([0]);
    expect(state().rows).toHaveLength(2);
  });

  it("ignores a split of something that was never combined", () => {
    state().setCsv(csv());
    state().splitRow("nope");
    expect(state().rows).toHaveLength(2);
  });

  it("stays out of undo history — split is its inverse, and rows are not design", () => {
    // Fifty snapshots each carrying 2000 rows would be its own kind of data loss.
    state().setCsv(threeRows());
    const historyBefore = state().past.length;
    state().combineRows([0, 2]);
    expect(state().past).toHaveLength(historyBefore);
    state().splitRow(state().rowIds[0]!);
    expect(state().rows).toHaveLength(3);
  });

  it("drops ids and combines when a new CSV arrives", () => {
    state().setCsv(threeRows());
    state().combineRows([0, 2]);
    state().setCsv(csv());
    expect(state().merged).toEqual({});
    expect(state().rowIds).toHaveLength(ROWS.length);
  });
});

describe("per-row overrides (D1)", () => {
  it("stores and clears a patch for one row", () => {
    state().setCsv(csv());
    state().addElement("text");
    const elementId = state().template.elements[0]!.id;
    const rowId = state().rowIds[0]!;

    state().overrideForRow(rowId, elementId, { fontSizePt: 11 });
    expect(state().template.overrides?.[rowId]?.[elementId]).toEqual({ fontSizePt: 11 });

    state().overrideForRow(rowId, elementId, null);
    expect(state().template.overrides?.[rowId]).toBeUndefined();
  });

  it("is undoable, because it is design and not data", () => {
    state().setCsv(csv());
    state().addElement("text");
    const elementId = state().template.elements[0]!.id;
    state().overrideForRow(state().rowIds[0]!, elementId, { fontSizePt: 11 });
    state().undo();
    expect(state().template.overrides ?? {}).toEqual({});
  });
});

describe("a second CSV with different headers (S-B.1)", () => {
  it("re-attaches the design by column role rather than unbinding it", () => {
    state().setCsv(csv());
    const before = state().template.elements.length;
    expect(before).toBeGreaterThan(0);

    state().setCsv({
      headers: ["Guest First", "Guest Last", "Tbl", "Dietary Needs"],
      rows: [{ "Guest First": "Ada", "Guest Last": "Lovelace", Tbl: "Table 1", "Dietary Needs": "" }],
      issues: [],
      fileName: "next-year.csv",
    });

    const templates = state()
      .template.elements.flatMap((el) => (el.kind === "text" ? [el.template] : []));
    expect(state().template.elements).toHaveLength(before);
    expect(templates.join(" ")).toContain("{{Guest First}}");
    expect(templates.join(" ")).not.toContain("{{First Name}}");
  });

  it("builds a fresh template only when there was nothing to keep", () => {
    state().setCsv(csv());
    expect(state().template.elements.length).toBeGreaterThan(0);
  });
});
