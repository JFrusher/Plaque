import { describe, expect, it } from "vitest";
import { defaultCard } from "../template/defaults";
import { foldPositionIsValid } from "../geometry/fold";
import { CARD_PRESETS, applyCardPreset, validateCardPreset, type CardPreset } from "./cardPresets";

const preset = (over: Partial<CardPreset> = {}): CardPreset => ({
  id: "test",
  name: "Test card",
  widthMm: 85,
  heightMm: 55,
  fold: "none",
  foldPositionMm: 27.5,
  ...over,
});

describe("CARD_PRESETS", () => {
  it("ships some, and every one is valid", () => {
    expect(CARD_PRESETS.length).toBeGreaterThan(0);
    for (const p of CARD_PRESETS) expect([p.id, validateCardPreset(p)]).toEqual([p.id, null]);
  });

  it("has unique ids", () => {
    expect(new Set(CARD_PRESETS.map((p) => p.id)).size).toBe(CARD_PRESETS.length);
  });

  it("produces a card whose fold the geometry accepts", () => {
    // A preset that fails validateGeometry would put the user in an error state
    // the moment they picked it.
    for (const p of CARD_PRESETS) {
      const card = { ...defaultCard(), ...applyCardPreset(p) };
      expect([p.id, foldPositionIsValid(card)]).toEqual([p.id, true]);
    }
  });
});

describe("applyCardPreset", () => {
  it("sets size and fold, and leaves bleed and inversion alone", () => {
    const patch = applyCardPreset(preset({ fold: "horizontal", heightMm: 110, foldPositionMm: 55 }));
    expect(patch).toEqual({ widthMm: 85, heightMm: 110, fold: "horizontal", foldPositionMm: 55 });
    expect(patch).not.toHaveProperty("bleedMm");
    expect(patch).not.toHaveProperty("invertBackPanel");
  });
});

describe("validateCardPreset", () => {
  it("names the field that is wrong", () => {
    expect(validateCardPreset(preset({ id: "" }))).toBe("id");
    expect(validateCardPreset(preset({ widthMm: 0 }))).toBe("widthMm");
    expect(validateCardPreset({ ...preset(), fold: "diagonal" })).toBe("fold");
    expect(validateCardPreset(null)).toBe("not an object");
  });

  it("rejects a fold outside the card, which cannot be folded at all", () => {
    expect(validateCardPreset(preset({ fold: "horizontal", foldPositionMm: 99 }))).toBe(
      "foldPositionMm",
    );
  });

  it("rejects a card larger than any paper Plaque prints on", () => {
    expect(validateCardPreset(preset({ heightMm: 400 }))).toBe("widthMm");
  });
});
