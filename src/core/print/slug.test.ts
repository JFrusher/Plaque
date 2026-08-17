import { describe, expect, it } from "vitest";
import { defaultCard, defaultSheet } from "../template/defaults";
import { buildFingerprint, buildHash, slugText, type SlugInput } from "./slug";

const input = (over: Partial<SlugInput> = {}): SlugInput => ({
  card: defaultCard(),
  sheet: defaultSheet(),
  rowCount: 150,
  scale: 1,
  buildHash: "1a2b3c4d",
  sheetIndex: 2,
  sheetCount: 19,
  ...over,
});

describe("slugText", () => {
  it("states the sizes, the sheet, the count and the build", () => {
    const text = slugText(input());
    expect(text).toContain("Plaque");
    expect(text).toContain("150 cards");
    expect(text).toContain("sheet 3/19");
    expect(text).toContain("build 1a2b3c4d");
  });

  it("says the correction was 1 rather than staying silent", () => {
    // Silence would be ambiguous: no correction, or a correction not applied?
    expect(slugText(input({ scale: 1 }))).toContain("uncorrected");
    expect(slugText(input({ scale: 1.02 }))).toContain("×1.020");
  });

  it("names the fold only when there is one", () => {
    const card = defaultCard();
    expect(slugText(input({ card: { ...card, fold: "horizontal", foldPositionMm: 55 } }))).toContain(
      "fold H @ 55mm",
    );
    expect(slugText(input({ card: { ...card, fold: "none" } }))).not.toContain("fold");
  });

  it("distinguishes bleed from none, because it changes what gets trimmed", () => {
    expect(slugText(input({ card: { ...defaultCard(), bleedMm: 3 } }))).toContain("bleed 3mm");
    expect(slugText(input({ card: { ...defaultCard(), bleedMm: 0 } }))).toContain("no bleed");
  });
});

describe("buildHash", () => {
  it("is stable for the same input", () => {
    expect(buildHash("abc")).toBe(buildHash("abc"));
    expect(buildHash("abc")).toHaveLength(8);
  });

  it("changes when anything changes", () => {
    expect(buildHash("abc")).not.toBe(buildHash("abd"));
    expect(buildHash("")).toHaveLength(8);
  });

  it("stays inside 32 bits for a long input", () => {
    const hash = buildHash("x".repeat(100_000));
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("buildFingerprint", () => {
  it("tracks the things that change the printed result", () => {
    const base = { card: defaultCard(), sheet: defaultSheet(), template: {}, rowCount: 5, scale: 1 };
    expect(buildFingerprint(base)).toBe(buildFingerprint({ ...base }));
    expect(buildFingerprint({ ...base, rowCount: 6 })).not.toBe(buildFingerprint(base));
    expect(buildFingerprint({ ...base, scale: 1.02 })).not.toBe(buildFingerprint(base));
    expect(buildFingerprint({ ...base, card: { ...base.card, widthMm: 90 } })).not.toBe(
      buildFingerprint(base),
    );
  });
});
