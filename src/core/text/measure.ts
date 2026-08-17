import * as fontkit from "fontkit";
import type { Font } from "fontkit";
import type { Mm, Pt } from "../types";
import { ptToMm } from "../units";

/**
 * A parsed font plus the metrics both renderers agree on.
 *
 * Measurement happens here, with fontkit, and nowhere else. The browser's own
 * text layout is never consulted, because the PDF renderer cannot consult it —
 * if the two disagreed about a width, the preview and the printed sheet would
 * break lines in different places.
 */
export interface LoadedFont {
  id: string;
  family: string;
  font: Font;
  unitsPerEm: number;
  /** Em-relative, positive up. */
  ascent: number;
  descent: number;
  /** The original bytes, reused verbatim for FontFace and for pdf-lib. */
  data: Uint8Array;
}

export function loadFont(id: string, family: string, data: Uint8Array): LoadedFont {
  const parsed = fontkit.create(data as Buffer);
  if ("fonts" in parsed) {
    throw new Error(
      `"${family}" is a font collection (.ttc). Please supply a single font file.`,
    );
  }
  const font = parsed;
  return {
    id,
    family,
    font,
    unitsPerEm: font.unitsPerEm,
    ascent: font.ascent / font.unitsPerEm,
    descent: font.descent / font.unitsPerEm,
    data,
  };
}

/**
 * Ink width of a run, in millimetres, with kerning and ligatures applied.
 *
 * Letter spacing counts the gaps BETWEEN glyphs — n-1, not n. Both renderers
 * apply spacing after every glyph including the last, but that final gap only
 * advances the pen; it draws nothing. Ink extent is what fitting and alignment
 * care about, so n-1 is the right count for both.
 *
 * This only holds because both renderers place text from an explicit left
 * origin. Switching the SVG renderer to `text-anchor="middle"` would hand
 * centring to the browser, which uses the full advance, and the two would drift.
 */
export function measureWidth(
  font: LoadedFont,
  text: string,
  sizePt: Pt,
  letterSpacingMm: Mm = 0,
): Mm {
  if (text.length === 0) return 0;
  const run = font.font.layout(text);
  const emWidth = run.advanceWidth / font.unitsPerEm;
  const spacing = letterSpacingMm * Math.max(0, [...text].length - 1);
  return ptToMm(emWidth * sizePt) + spacing;
}

/** Distance between baselines. */
export function lineHeightMm(sizePt: Pt, lineHeight: number): Mm {
  return ptToMm(sizePt * lineHeight);
}

/** Height of a block of `count` lines, measured baseline to baseline plus one em box. */
export function blockHeightMm(count: number, sizePt: Pt, lineHeight: number): Mm {
  if (count <= 0) return 0;
  return lineHeightMm(sizePt, lineHeight) * (count - 1) + ptToMm(sizePt);
}

/**
 * Greedy word wrap to at most `maxLines`.
 *
 * A single word wider than the box is never split mid-word — that would hyphenate
 * a guest's surname arbitrarily. It goes on its own line and overflows, which the
 * caller detects and either shrinks away or reports.
 */
export function breakLines(
  font: LoadedFont,
  text: string,
  sizePt: Pt,
  maxWidthMm: Mm,
  letterSpacingMm: Mm,
  maxLines: number,
): string[] {
  const explicit = text.split("\n");
  const out: string[] = [];

  for (const paragraph of explicit) {
    const words = splitForBreaking(paragraph);
    if (words.length === 0) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      // A space is only reinserted between two space-separated pieces. CJK
      // breaks happen between characters that never had a space, and inventing
      // one would print a gap that is not in the name.
      const joiner = line && needsSpace(line, word) ? " " : "";
      const candidate = `${line}${joiner}${word}`;
      if (line && measureWidth(font, candidate, sizePt, letterSpacingMm) > maxWidthMm) {
        out.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) out.push(line);
  }

  if (out.length <= maxLines) return out;

  // Too many lines: keep the first maxLines-1 and let the remainder ride on the
  // last one, so no words are silently lost.
  const kept = out.slice(0, Math.max(1, maxLines - 1));
  kept.push(out.slice(Math.max(1, maxLines - 1)).join(" "));
  return kept;
}

/**
 * Scripts that break between characters rather than between words: CJK
 * ideographs, kana, and Hangul syllables (E2).
 */
const PER_CHARACTER =
  /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯　-〿]/u;

/**
 * Breakable pieces of a paragraph.
 *
 * Latin text breaks at spaces. A run of CJK breaks between its characters,
 * because a forty-character Japanese name has no spaces in it and would
 * otherwise be one unbreakable "word" that overflows every box.
 */
export function splitForBreaking(paragraph: string): string[] {
  const pieces: string[] = [];
  for (const word of paragraph.split(/\s+/).filter(Boolean)) {
    if (!PER_CHARACTER.test(word)) {
      pieces.push(word);
      continue;
    }
    // Mixed runs keep their Latin parts whole and split the CJK part per glyph.
    let latin = "";
    for (const char of word) {
      if (PER_CHARACTER.test(char)) {
        if (latin) pieces.push(latin);
        latin = "";
        pieces.push(char);
      } else {
        latin += char;
      }
    }
    if (latin) pieces.push(latin);
  }
  return pieces;
}

/** Two Latin pieces were separated by a space; CJK characters never were. */
function needsSpace(line: string, next: string): boolean {
  const last = [...line].at(-1) ?? "";
  const first = [...next][0] ?? "";
  return !PER_CHARACTER.test(last) && !PER_CHARACTER.test(first);
}

export function widestLineMm(
  font: LoadedFont,
  lines: string[],
  sizePt: Pt,
  letterSpacingMm: Mm,
): Mm {
  return lines.reduce((max, line) => Math.max(max, measureWidth(font, line, sizePt, letterSpacingMm)), 0);
}
