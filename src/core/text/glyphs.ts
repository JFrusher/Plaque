import type { LoadedFont } from "./measure";

/**
 * Missing-glyph detection (E2, discovery "failure modes").
 *
 * A face that has no glyph for "Ó" prints a hollow box — tofu — on a card that
 * cost real money, and nothing on screen necessarily says so. This finds it
 * before the sheet does, per row, and suggests a face that can print it.
 */
export interface GlyphReport {
  /** The characters this face cannot draw, in first-seen order. */
  missing: string[];
}

/**
 * fontkit maps an unsupported codepoint to glyph id 0, `.notdef`. Checking the
 * cmap directly rather than laying the text out keeps this cheap enough to run
 * over two thousand rows.
 */
export function missingGlyphs(font: LoadedFont, text: string): GlyphReport {
  const missing: string[] = [];
  for (const char of text) {
    // Whitespace and control characters are not the user's problem.
    if (char.trim().length === 0) continue;
    if (missing.includes(char)) continue;
    if (!hasGlyph(font, char)) missing.push(char);
  }
  return { missing };
}

export function hasGlyph(font: LoadedFont, char: string): boolean {
  const codePoint = char.codePointAt(0);
  if (codePoint === undefined) return true;
  try {
    return font.font.hasGlyphForCodePoint(codePoint);
  } catch {
    // A face that will not answer is not evidence of a missing glyph.
    return true;
  }
}

/**
 * A loaded face that can print every one of these characters — the "use this
 * instead" half of the warning, because naming the problem without an answer
 * just moves the work to the user.
 */
export function suggestFallback(
  fonts: Iterable<LoadedFont>,
  chars: string[],
  exclude: string,
): LoadedFont | null {
  for (const font of fonts) {
    if (font.id === exclude) continue;
    if (chars.every((char) => hasGlyph(font, char))) return font;
  }
  return null;
}
