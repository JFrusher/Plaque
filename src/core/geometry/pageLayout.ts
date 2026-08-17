import { pageSizeMm } from "../units";
import type { CardRotation, CardSpec, Mm, Point, SheetSpec, Size } from "../types";
import { cardFootprint } from "./transform";

export interface PageLayout {
  pageWidthMm: Mm;
  pageHeightMm: Mm;
  /** Card footprint on the sheet, after any on-sheet rotation. */
  footprint: Size;
  cardRotationDeg: CardRotation;
  cols: number;
  rows: number;
  perSheet: number;
  /** Top-left of the card at index 0. */
  origin: Point;
  gapXMm: Mm;
  gapYMm: Mm;
}

/** The rectangle inside the margins that cards may occupy. */
export function usableSize(sheet: SheetSpec): Size {
  const page = pageSizeMm(sheet.page, sheet.orientation);
  return {
    w: page.w - sheet.marginLeftMm - sheet.marginRightMm,
    h: page.h - sheet.marginTopMm - sheet.marginBottomMm,
  };
}

/**
 * How many cards of `size` fit across `available` with `gap` between them.
 *
 * n cards need n*size + (n-1)*gap, so n = floor((available + gap) / (size + gap)).
 * Gaps only sit between cards, never against the margin.
 */
export function fitCount(available: Mm, size: Mm, gap: Mm): number {
  if (size <= 0 || available < size) return 0;
  return Math.max(0, Math.floor((available + gap) / (size + gap)));
}

export function computeLayout(card: CardSpec, sheet: SheetSpec): PageLayout {
  const page = pageSizeMm(sheet.page, sheet.orientation);
  const footprint = cardFootprint({ w: card.widthMm, h: card.heightMm }, sheet.cardRotationDeg);
  const usable = usableSize(sheet);

  const cols = fitCount(usable.w, footprint.w, sheet.gapXMm);
  const rows = fitCount(usable.h, footprint.h, sheet.gapYMm);

  return {
    pageWidthMm: page.w,
    pageHeightMm: page.h,
    footprint,
    cardRotationDeg: sheet.cardRotationDeg,
    cols,
    rows,
    perSheet: cols * rows,
    origin: { x: sheet.marginLeftMm, y: sheet.marginTopMm },
    gapXMm: sheet.gapXMm,
    gapYMm: sheet.gapYMm,
  };
}

/** Top-left of the nth card on a sheet. Fills left to right, then top to bottom. */
export function cardOriginOnSheet(indexOnPage: number, layout: PageLayout): Point {
  if (layout.cols <= 0) throw new Error("No cards fit this sheet; nothing to place.");
  const col = indexOnPage % layout.cols;
  const row = Math.floor(indexOnPage / layout.cols);
  return {
    x: layout.origin.x + col * (layout.footprint.w + layout.gapXMm),
    y: layout.origin.y + row * (layout.footprint.h + layout.gapYMm),
  };
}
