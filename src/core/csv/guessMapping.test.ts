import { describe, expect, it } from "vitest";
import { defaultNameTemplate, guessMapping } from "./guessMapping";

describe("guessMapping", () => {
  it("matches the PRD's schema", () => {
    expect(guessMapping(["First Name", "Last Name", "Table", "Dietary", "Entree"])).toEqual({
      firstName: "First Name",
      lastName: "Last Name",
      fullName: null,
      table: "Table",
      dietary: "Dietary",
      entree: "Entree",
    });
  });

  it("ignores case, spaces and punctuation in headers", () => {
    const g = guessMapping(["FIRST_NAME", "surname", "Table No.", "Dietary Requirements"]);
    expect(g.firstName).toBe("FIRST_NAME");
    expect(g.lastName).toBe("surname");
    expect(g.table).toBe("Table No.");
    expect(g.dietary).toBe("Dietary Requirements");
  });

  it("recognises a single full-name column", () => {
    const g = guessMapping(["Guest Name", "Table"]);
    expect(g.fullName).toBe("Guest Name");
    expect(g.firstName).toBeNull();
  });

  it("guesses nothing it cannot justify", () => {
    expect(guessMapping(["Column A", "Column B"])).toEqual({
      firstName: null,
      lastName: null,
      fullName: null,
      table: null,
      dietary: null,
      entree: null,
    });
  });

  it("takes the first match when two headers could serve", () => {
    expect(guessMapping(["Diet", "Allergies"]).dietary).toBe("Diet");
  });

  it("does not assign one header to two fields", () => {
    const g = guessMapping(["Name"]);
    expect(g.fullName).toBe("Name");
    expect(g.firstName).toBeNull();
  });
});

describe("defaultNameTemplate", () => {
  it("joins first and last when both exist", () => {
    expect(defaultNameTemplate(["First Name", "Last Name"])).toBe("{{First Name}} {{Last Name}}");
  });

  it("falls back to a full-name column", () => {
    expect(defaultNameTemplate(["Guest", "Table"])).toBe("{{Guest}}");
  });

  it("falls back to the first column so something always renders", () => {
    expect(defaultNameTemplate(["Whatever", "Else"])).toBe("{{Whatever}}");
  });

  it("returns empty for no columns", () => {
    expect(defaultNameTemplate([])).toBe("");
  });
});
