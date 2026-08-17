import { describe, expect, it } from "vitest";
import { interpolate, tokensIn } from "./interpolate";

const row = { "First Name": "Charis", "Last Name": "Smith", Table: "Table 1", Dietary: "" };

describe("tokensIn", () => {
  it("lists referenced columns in order, without repeats", () => {
    expect(tokensIn("{{First Name}} {{Last Name}} — {{First Name}}")).toEqual([
      "First Name",
      "Last Name",
    ]);
  });

  it("tolerates whitespace inside the braces", () => {
    expect(tokensIn("{{  Table  }}")).toEqual(["Table"]);
  });

  it("finds nothing in plain text", () => {
    expect(tokensIn("Table of contents")).toEqual([]);
  });
});

describe("interpolate", () => {
  it("fills known columns", () => {
    expect(interpolate("{{First Name}} {{Last Name}}", row).text).toBe("Charis Smith");
  });

  it("mixes literal text with tokens", () => {
    expect(interpolate("Seated at {{Table}}", row).text).toBe("Seated at Table 1");
  });

  it("blanks an unknown token and names it, rather than printing braces on a card", () => {
    const r = interpolate("{{First Name}} {{Nickname}}", row);
    expect(r.text).toBe("Charis");
    expect(r.missing).toEqual(["Nickname"]);
    expect(r.text).not.toContain("{{");
  });

  it("does not leave a hole where an empty value was", () => {
    expect(interpolate("{{First Name}} {{Dietary}} {{Last Name}}", row).text).toBe("Charis Smith");
  });

  it("closes the gap left by an empty leading or trailing token", () => {
    expect(interpolate("{{Dietary}} {{First Name}}", row).text).toBe("Charis");
    expect(interpolate("{{First Name}} {{Dietary}}", row).text).toBe("Charis");
  });

  describe("whitespace the user meant", () => {
    // Collapsing every run of spaces was rewriting real data. A name with a
    // deliberate double space, or a template using spacing for layout, must
    // come out exactly as it went in.
    it("preserves a double space inside a value", () => {
      expect(interpolate("{{Name}}", { Name: "Mary  Jane" }).text).toBe("Mary  Jane");
    });

    it("preserves spacing the template itself contains", () => {
      expect(interpolate("{{First Name}}   {{Last Name}}", row).text).toBe("Charis   Smith");
    });

    it("preserves leading and trailing spacing in literal text", () => {
      expect(interpolate("  Top Table  ", row).text).toBe("  Top Table  ");
    });

    it("takes only one space per empty token, not every space", () => {
      expect(interpolate("{{First Name}}   {{Dietary}}", row).text).toBe("Charis  ");
    });
  });

  it("reports a missing column once however often it appears", () => {
    expect(interpolate("{{X}} {{X}}", row).missing).toEqual(["X"]);
  });

  it("treats an empty token as literal nothing", () => {
    expect(interpolate("a{{}}b", row).text).toBe("ab");
  });

  it("returns plain text unchanged", () => {
    expect(interpolate("Top Table", row)).toEqual({ text: "Top Table", missing: [] });
  });
});
