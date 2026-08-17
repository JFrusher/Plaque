import raw from "../../data/card-presets.json";
import { PAGE_SIZES_MM } from "../units";
import type { CardSpec, FoldAxis } from "../types";

/**
 * Product presets — "what am I making?", answered without arithmetic.
 *
 * Discovery §4 names "what size are my cards?" as the first thing that loses
 * people. Pure data (extension point 1): a contributor adds an entry to
 * `src/data/card-presets.json` and it appears in the picker.
 */
export interface CardPreset {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  fold: FoldAxis;
  foldPositionMm: number;
}

/** Applied over the current card, so bleed and back-panel inversion are kept. */
export function applyCardPreset(preset: CardPreset): Partial<CardSpec> {
  return {
    widthMm: preset.widthMm,
    heightMm: preset.heightMm,
    fold: preset.fold,
    foldPositionMm: preset.foldPositionMm,
  };
}

/** Returns the offending field, or null. Named so a bad entry is findable. */
export function validateCardPreset(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return "not an object";
  const p = value as Record<string, unknown>;
  for (const key of ["id", "name"]) {
    if (typeof p[key] !== "string" || !p[key]) return key;
  }
  for (const key of ["widthMm", "heightMm", "foldPositionMm"]) {
    const n = p[key];
    if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return key;
  }
  if (p["fold"] !== "none" && p["fold"] !== "horizontal" && p["fold"] !== "vertical") {
    return "fold";
  }

  const preset = value as CardPreset;
  // A fold outside the card is a preset that cannot be folded, which is a
  // wasted sheet rather than a design choice.
  const span = preset.fold === "vertical" ? preset.widthMm : preset.heightMm;
  if (preset.fold !== "none" && (preset.foldPositionMm <= 0 || preset.foldPositionMm >= span)) {
    return "foldPositionMm";
  }
  // Nothing here should be bigger than the largest paper Plaque can print on.
  const longest = Math.max(...Object.values(PAGE_SIZES_MM).map((s) => Math.max(s.w, s.h)));
  if (Math.max(preset.widthMm, preset.heightMm) > longest) return "widthMm";
  return null;
}

export const CARD_PRESETS: CardPreset[] = (raw.presets as unknown[]).filter((entry, index) => {
  const bad = validateCardPreset(entry);
  if (bad) {
    console.error(`card-presets.json: preset ${index} has an invalid "${bad}" — ignoring it.`);
    return false;
  }
  return true;
}) as CardPreset[];
