import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsv } from "./parse";

const fixture = (name: string) => readFileSync(`fixtures/${name}`, "utf8");

describe("parseCsv", () => {
  it("reads the plain fixture", () => {
    const { headers, rows, issues } = parseCsv(fixture("guests-5.csv"));
    expect(headers).toEqual(["First Name", "Last Name", "Table", "Dietary", "Entree"]);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toEqual({
      "First Name": "Charis",
      "Last Name": "Smith",
      Table: "Table 1",
      Dietary: "Vegetarian",
      Entree: "Risotto",
    });
    expect(issues).toEqual([]);
  });

  it("reads 150 rows", () => {
    expect(parseCsv(fixture("guests-150.csv")).rows).toHaveLength(150);
  });

  describe("the messy fixture", () => {
    const parsed = parseCsv(fixture("guests-messy.csv"));

    it("strips the BOM so the first column is addressable", () => {
      expect(parsed.headers[0]).toBe("First Name");
      expect(parsed.rows[0]?.["First Name"]).toBe("Chloé");
    });

    it("keeps unicode intact", () => {
      const names = parsed.rows.map((r) => r["First Name"]);
      expect(names).toContain("Ólafur");
      expect(names).toContain("李伟");
    });

    it("keeps a comma inside a quoted field", () => {
      expect(parsed.rows[0]?.["Notes"]).toBe("Allergic to celery, mildly");
    });

    it("unescapes doubled quotes", () => {
      expect(parsed.rows[2]?.["Notes"]).toBe('Says "no mushrooms" every year');
    });

    it("trims padded cells", () => {
      const niamh = parsed.rows.find((r) => r["First Name"] === "Niamh");
      expect(niamh?.["Last Name"]).toBe("O'Dwyer");
    });

    it("keeps a ragged row and reports it rather than dropping a guest", () => {
      const ragged = parsed.rows.find((r) => r["First Name"] === "Ragged");
      expect(ragged).toBeDefined();
      expect(ragged?.["Dietary"]).toBe("");
      expect(parsed.issues.some((i) => /missing/i.test(i.message))).toBe(true);
    });

    it("reports an over-long row and drops only the surplus", () => {
      const extra = parsed.rows.find((r) => r["First Name"] === "Extra");
      expect(extra?.["Notes"]).toBe("Fine");
      expect(parsed.issues.some((i) => /more values/i.test(i.message))).toBe(true);
    });

    it("skips the blank line without counting it as a guest", () => {
      expect(parsed.rows.every((r) => Object.values(r).some((v) => v !== ""))).toBe(true);
    });
  });

  describe("degenerate input", () => {
    it("reports a file with no columns", () => {
      const { rows, issues } = parseCsv("");
      expect(rows).toEqual([]);
      expect(issues[0]?.message).toMatch(/Is this a CSV/);
    });

    it("handles a semicolon or tab separated export without complaint", () => {
      expect(parseCsv("Name;Table\r\nCharis;1\r\n").rows[0]).toEqual({ Name: "Charis", Table: "1" });
      expect(parseCsv("Name\tTable\nCharis\t1\n").rows[0]).toEqual({ Name: "Charis", Table: "1" });
    });

    it("suggests a re-export when the delimiter is one nothing recognises", () => {
      const { issues } = parseCsv("Name~Table\r\nCharis~1\r\n");
      expect(issues.some((i) => /re-export it as comma-separated/.test(i.message))).toBe(true);
    });

    it("names blank headers so their column is still addressable", () => {
      const { headers } = parseCsv("Name,,Table\nCharis,x,1\n");
      expect(headers).toEqual(["Name", "Column 2", "Table"]);
    });

    it("disambiguates duplicate headers instead of losing a column", () => {
      const { headers, rows } = parseCsv("Name,Name\nCharis,Smith\n");
      expect(headers).toEqual(["Name", "Name (2)"]);
      expect(rows[0]).toEqual({ Name: "Charis", "Name (2)": "Smith" });
    });

    it("never yields undefined for a declared column", () => {
      const { headers, rows } = parseCsv("A,B,C\n1\n");
      for (const h of headers) expect(typeof rows[0]?.[h]).toBe("string");
    });
  });
});
