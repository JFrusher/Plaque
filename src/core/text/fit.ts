import type { FitConfig, Mm, Pt } from "../types";
import { blockHeightMm, breakLines, widestLineMm, type LoadedFont } from "./measure";

/** Shrinking steps down in half points. Finer than a printer can show. */
const STEP_PT = 0.5;

export interface FitInput {
  text: string;
  boxWMm: Mm;
  boxHMm: Mm;
  fontSizePt: Pt;
  lineHeight: number;
  letterSpacingMm: Mm;
  fit: FitConfig;
}

export interface FitOutcome {
  lines: string[];
  fontSizePt: Pt;
  /** True when the text still does not fit at the smallest size allowed. */
  overflowed: boolean;
}

/**
 * Decides the font size and the line breaks for one text element.
 *
 * This is the single place either of those is decided. The SVG preview and the
 * PDF both consume the result verbatim, so a name that breaks after "Alexander"
 * on screen breaks there on paper too.
 *
 * When the floor is reached and the text still does not fit, it renders AT the
 * floor and reports overflow rather than shrinking on into illegibility. A 5pt
 * name is not a place card; the user needs to know and decide.
 */
export function fitText(font: LoadedFont, input: FitInput): FitOutcome {
  const { text, fit } = input;
  if (text.length === 0) {
    return { lines: [], fontSizePt: input.fontSizePt, overflowed: false };
  }

  const maxLines = fit.mode === "none" || fit.mode === "shrink" ? 1 : Math.max(1, fit.maxLines);
  const floor = Math.min(fit.minFontSizePt, input.fontSizePt);
  const shrinks = fit.mode === "shrink" || fit.mode === "shrink-then-wrap";

  const attempt = (sizePt: Pt): { lines: string[]; fits: boolean } => {
    const lines =
      maxLines === 1
        ? [text.replace(/\s*\n\s*/g, " ")]
        : breakLines(font, text, sizePt, input.boxWMm, input.letterSpacingMm, maxLines);
    const widest = widestLineMm(font, lines, sizePt, input.letterSpacingMm);
    const height = blockHeightMm(lines.length, sizePt, input.lineHeight);
    return { lines, fits: widest <= input.boxWMm && height <= input.boxHMm };
  };

  const first = attempt(input.fontSizePt);
  if (first.fits) {
    return { lines: first.lines, fontSizePt: input.fontSizePt, overflowed: false };
  }

  if (!shrinks) {
    return { lines: first.lines, fontSizePt: input.fontSizePt, overflowed: true };
  }

  // Re-wrap at every size: narrower glyphs move the break points, so wrapping
  // once at the original size and then scaling would break in the wrong place.
  for (let size = input.fontSizePt - STEP_PT; size >= floor; size -= STEP_PT) {
    const tried = attempt(size);
    if (tried.fits) return { lines: tried.lines, fontSizePt: round(size), overflowed: false };
  }

  const atFloor = attempt(floor);
  return { lines: atFloor.lines, fontSizePt: round(floor), overflowed: !atFloor.fits };
}

export interface FitBlockInput {
  lines: string[];
  boxWMm: Mm;
  boxHMm: Mm;
  fontSizePt: Pt;
  lineHeight: number;
  letterSpacingMm: Mm;
  fit: FitConfig;
}

/**
 * Decides the size for a block of lines that are already broken — a list
 * element, where each row of the artefact is one line (discovery §1).
 *
 * Same rule as `fitText` and deliberately in the same file: font size is decided
 * here, from fontkit metrics, and nowhere else. A list that sized itself in the
 * renderer would break the one invariant that keeps the preview and the print
 * agreeing.
 *
 * Lines are never re-wrapped: a menu line that wrapped would read as two guests.
 * It shrinks until the widest line fits and the stack fits, then reports
 * overflow at the floor rather than shrinking into illegibility.
 */
export function fitBlock(font: LoadedFont, input: FitBlockInput): FitOutcome {
  if (input.lines.length === 0) {
    return { lines: [], fontSizePt: input.fontSizePt, overflowed: false };
  }

  const floor = Math.min(input.fit.minFontSizePt, input.fontSizePt);
  const shrinks = input.fit.mode !== "none";

  const fits = (sizePt: Pt): boolean =>
    widestLineMm(font, input.lines, sizePt, input.letterSpacingMm) <= input.boxWMm &&
    blockHeightMm(input.lines.length, sizePt, input.lineHeight) <= input.boxHMm;

  if (fits(input.fontSizePt)) {
    return { lines: input.lines, fontSizePt: input.fontSizePt, overflowed: false };
  }
  if (!shrinks) {
    return { lines: input.lines, fontSizePt: input.fontSizePt, overflowed: true };
  }

  for (let size = input.fontSizePt - STEP_PT; size >= floor; size -= STEP_PT) {
    if (fits(size)) return { lines: input.lines, fontSizePt: round(size), overflowed: false };
  }
  return { lines: input.lines, fontSizePt: round(floor), overflowed: !fits(floor) };
}

function round(pt: Pt): Pt {
  return Math.round(pt * 100) / 100;
}

export const DEFAULT_FIT: FitConfig = {
  mode: "shrink",
  minFontSizePt: 8,
  maxLines: 2,
  anchor: "align",
};
