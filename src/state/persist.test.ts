import { describe, expect, it } from "vitest";
import { defaultCard, defaultSheet, defaultTemplate } from "../core/template/defaults";
import type { Snapshot } from "./history";
import { load, saveFailureReason, type Persisted } from "./persist";

const design = (): Snapshot => ({
  card: defaultCard(),
  sheet: defaultSheet(),
  template: defaultTemplate(["First Name", "Last Name"]),
});

const good = (over: Partial<Persisted> = {}): Persisted => ({
  version: 2,
  savedAt: "2026-08-17T13:42:00.000Z",
  ...design(),
  headers: ["First Name", "Last Name"],
  rows: [{ "First Name": "Charis", "Last Name": "Smith" }],
  rowIds: ["r0"],
  merged: {},
  csvIssues: [],
  fileName: "guests.csv",
  uploadedIcons: {},
  assetNames: {},
  snapEnabled: true,
  past: [],
  future: [],
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
    expect(result.status === "ok" && result.data.savedAt).toBe("2026-08-17T13:42:00.000Z");
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

  it("preserves undo depth across a reload", () => {
    const past = [design(), design(), design()];
    const result = load(JSON.stringify(good({ past, future: [design()] })));
    expect(result.status === "ok" && result.data.past).toHaveLength(3);
    expect(result.status === "ok" && result.data.future).toHaveLength(1);
  });

  it("drops an unusable history entry but keeps the design", () => {
    // Undo depth is a papercut to lose. The work is not.
    const past = [design(), { ...design(), card: { ...defaultCard(), widthMm: Number.NaN } }];
    const result = load(JSON.stringify(good({ past })));
    expect(result.status).toBe("ok");
    expect(result.status === "ok" && result.data.past).toHaveLength(1);
  });

  it("gives rows positional ids when the save predates them", () => {
    // Overrides keyed by those same positional ids still land after an upgrade.
    const { rowIds: _rowIds, ...older } = good();
    const result = load(JSON.stringify(older));
    expect(result.status === "ok" && result.data.rowIds).toEqual(["r0"]);
  });

  it("upgrades a v1 save, which had no history and no timestamp", () => {
    const { savedAt: _savedAt, past: _past, future: _future, ...v1 } = good({ version: 1 });
    const result = load(JSON.stringify({ ...v1, version: 1 }));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.version).toBe(2);
    expect(result.data.savedAt).toBeNull();
    expect(result.data.past).toEqual([]);
    expect(result.data.rows).toHaveLength(1);
  });
});

describe("saveFailureReason", () => {
  it("separates a full browser from a blocked one, because the remedy differs", () => {
    expect(saveFailureReason(new DOMException("nope", "QuotaExceededError"))).toMatch(/no room/);
    expect(saveFailureReason(new DOMException("nope", "SecurityError"))).toMatch(/private window/);
  });

  it("always produces something a user can read", () => {
    expect(saveFailureReason(new Error("Internal error opening backing store"))).toBe(
      "Internal error opening backing store",
    );
    expect(saveFailureReason(new Error(""))).toMatch(/refused to save/);
    expect(saveFailureReason("weird")).toMatch(/refused to save/);
    expect(saveFailureReason(undefined)).toMatch(/refused to save/);
  });
});
