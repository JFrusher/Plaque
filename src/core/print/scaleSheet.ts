import type { Point, ResolvedElement, Segment, Sheet } from "../types";

/**
 * Applies a printer calibration factor to an imposed sheet (S-D2.1).
 *
 * The page size is deliberately left alone: the paper is still A4. What changes
 * is everything printed on it, scaled about the centre of the sheet, so a driver
 * that shrinks the page to 97% is cancelled out and an 85mm card comes off the
 * printer 85mm wide.
 *
 * Pure, and here rather than in a renderer, for two reasons: it is testable
 * without building a PDF, and the PDF renderer must not be the thing that
 * decides sizes. Note that this scales an ALREADY FITTED scene uniformly — it
 * does not re-fit anything, so line breaks stay exactly as core/text/fit
 * decided them.
 */
export function scaleSheetContent(sheet: Sheet, factor: number): Sheet {
  if (factor === 1) return sheet;

  const cx = sheet.pageWidthMm / 2;
  const cy = sheet.pageHeightMm / 2;
  const point = (p: Point): Point => ({
    x: cx + (p.x - cx) * factor,
    y: cy + (p.y - cy) * factor,
  });
  const segment = (s: Segment): Segment => [point(s[0]), point(s[1])];

  return {
    ...sheet,
    cards: sheet.cards.map((card) => ({
      ...card,
      origin: point(card.origin),
      footprint: { w: card.footprint.w * factor, h: card.footprint.h * factor },
      scene: { ...card.scene, elements: card.scene.elements.map((el) => element(el, point, factor)) },
    })),
    guides: {
      cropMarks: sheet.guides.cropMarks.map(segment),
      cutLines: sheet.guides.cutLines.map(segment),
      foldGuides: sheet.guides.foldGuides.map(segment),
      bleedBoxes: sheet.guides.bleedBoxes.map((box) => {
        const at = point(box);
        return { x: at.x, y: at.y, w: box.w * factor, h: box.h * factor };
      }),
    },
  };
}

function element(
  el: ResolvedElement,
  point: (p: Point) => Point,
  factor: number,
): ResolvedElement {
  const at = point({ x: el.x, y: el.y });
  const base = { x: at.x, y: at.y, w: el.w * factor, h: el.h * factor };

  switch (el.kind) {
    case "text":
      // Font size and letter spacing are lengths like any other. Scaling them
      // with the box is what keeps the card looking identical, only bigger.
      return {
        ...el,
        ...base,
        fontSizePt: el.fontSizePt * factor,
        letterSpacingMm: el.letterSpacingMm * factor,
      };
    case "rect":
      return { ...el, ...base, strokeWidthMm: el.strokeWidthMm * factor };
    case "line":
      return { ...el, ...base, strokeWidthMm: el.strokeWidthMm * factor };
    // An icon's `view` is its own drawing space, not millimetres — the fitter
    // maps it into the box, so scaling the box is enough.
    case "icon":
    case "image":
      return { ...el, ...base };
  }
}
