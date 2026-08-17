import { cardGuides } from "../geometry/cropMarks";
import { cardOriginOnSheet, computeLayout, type PageLayout } from "../geometry/pageLayout";
import { cardToSheet } from "../geometry/transform";
import { resolveCard, type CardWarning, type ResolveOptions } from "../template/bindings";
import type { GuestRow } from "../csv/parse";
import type { CardSpec, ResolvedElement, Sheet, SheetGuides, SheetSpec, Template } from "../types";

export interface GuestWarning extends CardWarning {
  guestIndex: number;
}

export interface PaginateResult {
  sheets: Sheet[];
  layout: PageLayout;
  /** Total sheets the whole guest list needs, even if only some were built. */
  sheetCount: number;
  warnings: GuestWarning[];
}

export interface PaginateOptions {
  /**
   * Build only these pages, inclusive. The editor shows one sheet at a time, and
   * resolving all 150 guests on every drag frame is what puts it under 60fps.
   */
  pages?: { from: number; to: number };
}

/**
 * Lays every guest's card out across as many sheets as it takes.
 *
 * This is where card-local coordinates become sheet coordinates. On-sheet card
 * rotation is folded into each element's own rotation here, so a renderer only
 * ever sees "a box at these millimetres, spun this far about its centre".
 */
/** Sheets the whole list needs, without building any of them. */
export function sheetCountFor(rowCount: number, card: CardSpec, sheet: SheetSpec): number {
  const perSheet = computeLayout(card, sheet).perSheet;
  return perSheet === 0 || rowCount === 0 ? 0 : Math.ceil(rowCount / perSheet);
}

/**
 * Warnings for every guest, without imposing anything.
 *
 * Separated from `paginate` so the editor can show one sheet cheaply while the
 * full "these names do not fit" pass runs at a lower priority.
 */
export function collectWarnings(
  template: Template,
  rows: GuestRow[],
  card: CardSpec,
  opts: ResolveOptions,
): GuestWarning[] {
  const warnings: GuestWarning[] = [];
  for (const [guestIndex, row] of rows.entries()) {
    for (const w of resolveCard(template, row, card, opts).warnings) {
      warnings.push({ ...w, guestIndex });
    }
  }
  return warnings;
}

export function paginate(
  template: Template,
  rows: GuestRow[],
  card: CardSpec,
  sheet: SheetSpec,
  opts: ResolveOptions,
  options: PaginateOptions = {},
): PaginateResult {
  const layout = computeLayout(card, sheet);
  const warnings: GuestWarning[] = [];
  const sheets: Sheet[] = [];

  if (layout.perSheet === 0 || rows.length === 0) {
    return { sheets, layout, sheetCount: 0, warnings };
  }

  const cardSize = { w: card.widthMm, h: card.heightMm };
  const pageCount = Math.ceil(rows.length / layout.perSheet);
  const from = Math.max(0, options.pages?.from ?? 0);
  const to = Math.min(pageCount - 1, options.pages?.to ?? pageCount - 1);

  for (let page = from; page <= to; page++) {
    const guides: SheetGuides = { cropMarks: [], cutLines: [], foldGuides: [], bleedBoxes: [] };
    const cards: Sheet["cards"] = [];

    for (let slot = 0; slot < layout.perSheet; slot++) {
      const guestIndex = page * layout.perSheet + slot;
      const row = rows[guestIndex];
      if (!row) break;

      const origin = cardOriginOnSheet(slot, layout);
      const resolved = resolveCard(template, row, card, opts);
      for (const w of resolved.warnings) warnings.push({ ...w, guestIndex });

      const elements: ResolvedElement[] = resolved.scene.elements.map((el) => {
        const box = cardToSheet(
          { x: el.x, y: el.y, w: el.w, h: el.h },
          cardSize,
          sheet.cardRotationDeg,
          origin,
        );
        return {
          ...el,
          x: box.x,
          y: box.y,
          w: box.w,
          h: box.h,
          rotationDeg: el.rotationDeg + sheet.cardRotationDeg,
        };
      });

      const g = cardGuides(origin, card, sheet.cardRotationDeg, {
        cropMarks: sheet.cropMarks,
        cutLines: sheet.cutLines,
        foldGuides: sheet.foldGuides,
        bleedGuides: sheet.bleedGuides,
      });
      guides.cropMarks.push(...g.cropMarks);
      guides.cutLines.push(...g.cutLines);
      guides.foldGuides.push(...g.foldGuides);
      if (g.bleedBox) guides.bleedBoxes.push(g.bleedBox);

      cards.push({
        origin,
        footprint: layout.footprint,
        guestIndex,
        scene: { elements, backgroundHex: resolved.scene.backgroundHex },
      });
    }

    sheets.push({
      index: page,
      pageWidthMm: layout.pageWidthMm,
      pageHeightMm: layout.pageHeightMm,
      cards,
      guides,
    });
  }

  return { sheets, layout, sheetCount: pageCount, warnings };
}
