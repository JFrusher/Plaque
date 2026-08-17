import { describe, expect, it } from "vitest";
import { defaultCard, defaultSheet, defaultTemplate } from "../core/template/defaults";
import { load, type Persisted } from "./persist";

const good = (over: Partial<Persisted> = {}): Persisted => ({
  version: 1,
  card: defaultCard(),
  sheet: defaultSheet(),
  template: defaultTemplate(["First Name", "Last Name"]),
  headers: ["First Name", "Last Name"],
  rows: [{ "First Name": "Charis", "Last Name": "Smith" }],
  csvIssues: [],
  fileName: "guests.csv",
  uploadedIcons: {},
  snapEnabled: true,
  ...over,
});

describe("load", () => {
  it("reports nothing saved", () => {
    expect(load(null)).toEqual({ status: "empty" });
    expect(load("")).toEqual({ status: "empty" });
  });

  it("accepts a well-formed save", () => {
    const result = load(JSON.stringify(good()));
    expect(result.status).toBe("ok");
    expect(result.status === "ok" && result.data.rows).toHaveLength(1);
  });

  it("discards unparseable JSON instead of throwing", () => {
    expect(load("{not json")).toMatchObject({ status: "discarded" });
  });

  it("discards a save from another version rather than half-applying it", () => {
    const result = load(JSON.stringify(good({ version: 99 })));
    expect(result.status).toBe("discarded");
    expect(result.status === "discarded" && result.reason).toMatch(/different version/);
  });

  it("discards a save missing its design", () => {
    const { card: _card, ...rest } = good();
    expect(load(JSON.stringify(rest))).toMatchObject({ status: "discarded" });
  });

  it("discards a template with no element list", () => {
    const broken = { ...good(), template: { backgroundHex: null } };
    expect(load(JSON.stringify(broken))).toMatchObject({ status: "discarded" });
  });

  it("discards a design whose numbers are not numbers", () => {
    // Hand-edited or half-migrated storage. Left unchecked these reach the
    // layout maths and silently produce zero sheets.
    const stringy = load(
      JSON.stringify({ ...good(), card: { ...good().card, widthMm: "85" } }),
    );
    expect(stringy).toMatchObject({ status: "discarded" });
    expect(stringy.status === "discarded" && stringy.reason).toMatch(/widthMm/);

    expect(
      load(JSON.stringify({ ...good(), sheet: { ...good().sheet, gapXMm: null } })),
    ).toMatchObject({ status: "discarded" });
  });

  it("discards NaN and Infinity, which JSON round-trips as null", () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const raw = JSON.stringify({ ...good(), card: { ...good().card, bleedMm: value } });
      expect(load(raw)).toMatchObject({ status: "discarded" });
    }
  });

  it("discards a save whose guest list is not a list", () => {
    expect(load(JSON.stringify({ ...good(), rows: "nope" }))).toMatchObject({
      status: "discarded",
    });
  });

  it("discards a bare array or primitive", () => {
    expect(load("[]")).toMatchObject({ status: "discarded" });
    expect(load("42")).toMatchObject({ status: "discarded" });
    expect(load("null")).toMatchObject({ status: "discarded" });
  });
});
