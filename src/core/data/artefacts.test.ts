import { describe, expect, it } from "vitest";
import { buildArtefacts, normalise } from "./artefacts";

const rows = [
  { Name: "Charis", Table: "Table 1", Meal: "Fish" },
  { Name: "Tobias", Table: "table 1 ", Meal: "Beef" },
  { Name: "Eleanor", Table: "Table 2", Meal: "Fish" },
];
const headers = ["Name", "Table", "Meal"];

describe("buildArtefacts — per row", () => {
  it("makes one artefact per row, which is the old behaviour", () => {
    const out = buildArtefacts(rows, { kind: "per-row" }, headers);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ rowIndexes: [0], label: "Charis Table 1" });
    expect(out[0]?.rows).toEqual([rows[0]]);
  });

  it("labels a blank row rather than showing nothing", () => {
    expect(buildArtefacts([{ Name: "" }], { kind: "per-row" }, ["Name"])[0]?.label).toBe(
      "(blank row)",
    );
  });

  it("produces nothing from no rows", () => {
    expect(buildArtefacts([], { kind: "per-row" }, headers)).toEqual([]);
  });
});

describe("buildArtefacts — per group", () => {
  const grouped = () => buildArtefacts(rows, { kind: "per-group", byColumn: "Table" }, headers);

  it("makes one artefact per distinct value", () => {
    expect(grouped()).toHaveLength(2);
  });

  it("does not split a table over case or stray whitespace", () => {
    // "1" and "table 1 " are different strings but the same table to a human —
    // splitting them silently prints two half-empty menus.
    const first = grouped()[0]!;
    expect(first.rows).toHaveLength(2);
    expect(first.rowIndexes).toEqual([0, 1]);
  });

  it("prints the original value, never the normalised one", () => {
    expect(grouped()[0]?.label).toBe("Table 1 (2)");
  });

  it("resolves tokens against the first row of the group", () => {
    // This is what makes {{Table}} work on a table number card with no special case.
    expect(grouped()[0]?.row).toEqual(rows[0]);
  });

  it("keeps the CSV's own order rather than sorting", () => {
    const out = buildArtefacts(
      [{ Table: "9" }, { Table: "2" }, { Table: "9" }],
      { kind: "per-group", byColumn: "Table" },
      ["Table"],
    );
    expect(out.map((a) => a.label)).toEqual(["9 (2)", "2 (1)"]);
  });

  it("gathers rows with no value into one named group", () => {
    const out = buildArtefacts(
      [{ Table: "" }, { Table: "1" }],
      { kind: "per-group", byColumn: "Table" },
      ["Table"],
    );
    expect(out).toHaveLength(2);
    expect(out[0]?.label).toBe("(blank) (1)");
  });

  it("makes one group when the column does not exist, rather than failing", () => {
    const out = buildArtefacts(rows, { kind: "per-group", byColumn: "Nope" }, headers);
    expect(out).toHaveLength(1);
    expect(out[0]?.rows).toHaveLength(3);
  });
});

describe("buildArtefacts — document", () => {
  it("makes exactly one artefact holding every row", () => {
    const out = buildArtefacts(rows, { kind: "document" }, headers);
    expect(out).toHaveLength(1);
    expect(out[0]?.rows).toHaveLength(3);
    expect(out[0]?.label).toBe("All 3 rows");
  });

  it("produces nothing from no rows — a run-sheet of nothing is not a page", () => {
    expect(buildArtefacts([], { kind: "document" }, headers)).toEqual([]);
  });
});

describe("normalise", () => {
  it("folds the differences that are not differences", () => {
    expect(normalise(" Table 1 ")).toBe("table 1");
    expect(normalise("Table  1")).toBe("table 1");
    expect(normalise("Table—1")).toBe("table-1");
    expect(normalise("Table-1")).toBe("table-1");
  });

  it("keeps genuinely different values apart", () => {
    expect(normalise("Table 1")).not.toBe(normalise("Table 11"));
  });
});
