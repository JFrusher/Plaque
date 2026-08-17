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

/** Advance width of a run, in millimetres, with kerning and ligatures applied. */
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
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
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

export function widestLineMm(
  font: LoadedFont,
  lines: string[],
  sizePt: Pt,
  letterSpacingMm: Mm,
): Mm {
  return lines.reduce((max, line) => Math.max(max, measureWidth(font, line, sizePt, letterSpacingMm)), 0);
}
