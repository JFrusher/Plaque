import type { Mm, Pt } from "../types";
import { ptToMm } from "../units";
import type { LoadedFont } from "./measure";

/**
 * Optical adjustments — the difference between "printed at home" and "bought"
 * (discovery §6.11).
 *
 * All of it is fontkit glyph metrics, computed here and applied once in
 * `layoutLines`, so both renderers inherit it and neither can drift. Nothing in
 * this file consults browser text layout, for the usual reason.
 */

/** Characters allowed to hang outside the measure. Quotes, hyphens, thin marks. */
const HANGING = new Set([
  ".",
  ",",
  "'",
  '"',
  "‘",
  "’",
  "“",
  "”",
  "-",
  "‐",
  "–",
  "—",
  "·",
]);

export interface OpticalConfig {
  /**
   * Centre by the ink, not the advance. "A." metrically centred sits visibly
   * left because the full stop's side bearing counts as width; optically centred
   * it looks centred, which is what the eye is judging.
   */
  opticalAlign: boolean;
  /** Let a leading or trailing quote or hyphen hang past the edge of the measure. */
  hangingPunctuation: boolean;
  /**
   * `null` leaves the font's own defaults alone. Otherwise the named OpenType
   * features are the ones passed to fontkit when measuring, so a face's ligature
   * set can be turned off for a name it mangles.
   */
  features: string[] | null;
}

export const DEFAULT_OPTICAL: OpticalConfig = {
  opticalAlign: false,
  hangingPunctuation: false,
  features: null,
};

/**
 * How far the ink of a run sits inside its advance, at the two ends.
 *
 * Positive values mean there is empty space between the pen position and the
 * first mark (`left`), or between the last mark and the final pen position
 * (`right`).
 */
export function sideBearings(
  font: LoadedFont,
  text: string,
  sizePt: Pt,
  features?: string[] | null,
): { left: Mm; right: Mm } {
  if (text.length === 0) return { left: 0, right: 0 };

  const run = font.font.layout(text, features ?? undefined);
  const glyphs = run.glyphs;
  const first = glyphs[0];
  const last = glyphs[glyphs.length - 1];
  if (!first || !last) return { left: 0, right: 0 };

  const perEm = (units: number) => ptToMm((units / font.unitsPerEm) * sizePt);
  const leftUnits = boxOf(first)?.minX ?? 0;
  const lastBox = boxOf(last);
  const lastAdvance = run.positions[run.positions.length - 1]?.xAdvance ?? last.advanceWidth;
  const rightUnits = lastBox ? lastAdvance - lastBox.maxX : 0;

  // A blank glyph reports a degenerate box; treating that as bearing would shove
  // a line that ends in a space wildly off.
  return {
    left: Number.isFinite(leftUnits) ? perEm(leftUnits) : 0,
    right: Number.isFinite(rightUnits) ? perEm(rightUnits) : 0,
  };
}

/**
 * The shift that optically centres a run: half the difference between its two
 * side bearings, so heavier ink on one side pulls the line the other way.
 */
export function opticalShiftMm(
  font: LoadedFont,
  text: string,
  sizePt: Pt,
  features?: string[] | null,
): Mm {
  const { left, right } = sideBearings(font, text, sizePt, features);
  return (right - left) / 2;
}

/**
 * How far a line may hang past the left and right edges of the measure.
 *
 * Only the mark itself hangs: the width returned is the ink width of the
 * punctuation, so the letters still line up with the ones above and below.
 */
export function hangMm(
  font: LoadedFont,
  text: string,
  sizePt: Pt,
  features?: string[] | null,
): { left: Mm; right: Mm } {
  if (text.length === 0) return { left: 0, right: 0 };
  const chars = [...text];
  const firstChar = chars[0]!;
  const lastChar = chars[chars.length - 1]!;

  const advanceOf = (char: string): Mm => {
    const run = font.font.layout(char, features ?? undefined);
    return ptToMm((run.advanceWidth / font.unitsPerEm) * sizePt);
  };

  return {
    left: HANGING.has(firstChar) ? advanceOf(firstChar) : 0,
    right: HANGING.has(lastChar) ? advanceOf(lastChar) : 0,
  };
}

/** Every OpenType feature the face declares, for the ligature control UI. */
export function availableFeatures(font: LoadedFont): string[] {
  try {
    return [...new Set(font.font.availableFeatures)].sort();
  } catch {
    return [];
  }
}

/** Common features worth a switch, when the face has them. */
export const NOTABLE_FEATURES = ["liga", "dlig", "clig", "kern", "onum", "smcp", "swsh"] as const;

function boxOf(glyph: { bbox?: { minX: number; maxX: number } }): { minX: number; maxX: number } | null {
  try {
    const box = glyph.bbox;
    return box && Number.isFinite(box.minX) && Number.isFinite(box.maxX) ? box : null;
  } catch {
    return null;
  }
}
