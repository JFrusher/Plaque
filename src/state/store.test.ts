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
