import type { HAlign, Mm, Point, Pt, VAlign } from "../types";
import { ptToMm } from "../units";
import { blockHeightMm, lineHeightMm, measureWidth, type LoadedFont } from "./measure";

export interface LaidOutLine {
  text: string;
  /**
   * Start of the baseline, in element-local millimetres where (0,0) is the box's
   * top-left and y increases downward. Always the LEFT end of the run, whatever
   * the alignment, so a renderer never has to reverse-engineer the anchor.
   */
  baseline: Point;
  widthMm: Mm;
}

export interface TextBlock {
  lines: string[];
  fontSizePt: Pt;
  lineHeight: number;
  align: HAlign;
  vAlign: VAlign;
  letterSpacingMm: Mm;
  w: Mm;
  h: Mm;
}

/**
 * Places each line's baseline inside the element box.
 *
 * Both renderers call this. Neither does any alignment arithmetic of its own,
 * which is what stops the preview and the PDF from disagreeing about where a
 * centred name sits.
 */
export function layoutLines(font: LoadedFont, block: TextBlock): LaidOutLine[] {
  if (block.lines.length === 0) return [];

  const step = lineHeightMm(block.fontSizePt, block.lineHeight);
  const blockH = blockHeightMm(block.lines.length, block.fontSizePt, block.lineHeight);

  const top =
    block.vAlign === "top"
      ? 0
      : block.vAlign === "middle"
        ? (block.h - blockH) / 2
        : block.h - blockH;

  // The em box is one font size tall by the same convention `blockHeightMm`
  // uses, and the baseline sits an ascent below its top.
  const ascentMm = ptToMm(block.fontSizePt) * ascentRatio(font);

  return block.lines.map((text, i) => {
    const widthMm = measureWidth(font, text, block.fontSizePt, block.letterSpacingMm);
    const x =
      block.align === "left"
        ? 0
        : block.align === "center"
          ? (block.w - widthMm) / 2
          : block.w - widthMm;
    return {
      text,
      widthMm,
      baseline: { x, y: top + ascentMm + i * step },
    };
  });
}

/**
 * Where the baseline sits within the em box. Some faces declare an ascent over
 * a full em, which would push the first line out of the top of its box, so the
 * ratio is clamped to the share of the em the box actually has room for.
 */
function ascentRatio(font: LoadedFont): number {
  const total = font.ascent - font.descent;
  if (total <= 0) return 0.8;
  return font.ascent / total;
}
