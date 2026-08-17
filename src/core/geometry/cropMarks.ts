import type { CardRotation, CardSpec, Mm, Point, Rect, Segment } from "../types";
import { foldSegment } from "./fold";
import { cardFootprint, cardPointToSheet } from "./transform";

/** Crop mark arm length. 5mm is the usual trade convention. */
export const MARK_LENGTH_MM = 5;
/** Hairline. Thin enough that the blade, not the ink, defines the edge. */
export const HAIRLINE_PT = 0.25;

export interface CardGuides {
  /** Corner registration marks, offset outside the bleed. */
  cropMarks: Segment[];
  /** The trim outline itself. */
  cutLines: Segment[];
  /** Dashed, on the fold axis. */
  foldGuides: Segment[];
  /** Screen only. Null when the card has no bleed. */
  bleedBox: Rect | null;
}

export interface GuideOptions {
  cropMarks: boolean;
  cutLines: boolean;
  foldGuides: boolean;
  bleedGuides: boolean;
  markLengthMm?: Mm;
}

/**
 * Guides for one placed card, in sheet coordinates.
 *
 * Crop marks sit OUTSIDE the bleed, not against the trim edge — otherwise the
 * bleed prints over them and the cutter has nothing to line up on.
 */
export function cardGuides(
  origin: Point,
  card: CardSpec,
  rotation: CardRotation,
  opts: GuideOptions,
): CardGuides {
  const fp = cardFootprint({ w: card.widthMm, h: card.heightMm }, rotation);
  const b = Math.max(0, card.bleedMm);
  const L = opts.markLengthMm ?? MARK_LENGTH_MM;

  const x0 = origin.x;
  const y0 = origin.y;
  const x1 = origin.x + fp.w;
  const y1 = origin.y + fp.h;

  const cropMarks: Segment[] = opts.cropMarks
    ? [
        // Top-left
        [{ x: x0 - b - L, y: y0 }, { x: x0 - b, y: y0 }],
        [{ x: x0, y: y0 - b - L }, { x: x0, y: y0 - b }],
        // Top-right
        [{ x: x1 + b, y: y0 }, { x: x1 + b + L, y: y0 }],
        [{ x: x1, y: y0 - b - L }, { x: x1, y: y0 - b }],
        // Bottom-left
        [{ x: x0 - b - L, y: y1 }, { x: x0 - b, y: y1 }],
        [{ x: x0, y: y1 + b }, { x: x0, y: y1 + b + L }],
        // Bottom-right
        [{ x: x1 + b, y: y1 }, { x: x1 + b + L, y: y1 }],
        [{ x: x1, y: y1 + b }, { x: x1, y: y1 + b + L }],
      ]
    : [];

  const cutLines: Segment[] = opts.cutLines
    ? [
        [{ x: x0, y: y0 }, { x: x1, y: y0 }],
        [{ x: x1, y: y0 }, { x: x1, y: y1 }],
        [{ x: x1, y: y1 }, { x: x0, y: y1 }],
        [{ x: x0, y: y1 }, { x: x0, y: y0 }],
      ]
    : [];

  const local = foldSegment(card);
  const foldGuides: Segment[] =
    opts.foldGuides && local
      ? [
          [
            cardPointToSheet(local[0], { w: card.widthMm, h: card.heightMm }, rotation, origin),
            cardPointToSheet(local[1], { w: card.widthMm, h: card.heightMm }, rotation, origin),
          ],
        ]
      : [];

  const bleedBox: Rect | null =
    opts.bleedGuides && b > 0
      ? { x: x0 - b, y: y0 - b, w: fp.w + b * 2, h: fp.h + b * 2 }
      : null;

  return { cropMarks, cutLines, foldGuides, bleedBox };
}
