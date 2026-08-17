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
  warnings: GuestWarning[];
}

/**
 * Lays every guest's card out across as many sheets as it takes.
 *
 * This is where card-local coordinates become sheet coordinates. On-sheet card
 * rotation is folded into each element's own rotation here, so a renderer only
 * ever sees "a box at these millimetres, spun this far about its centre".
 */
export function paginate(
  template: Template,
  rows: GuestRow[],
  card: CardSpec,
  sheet: SheetSpec,
  opts: ResolveOptions,
): PaginateResult {
  const layout = computeLayout(card, sheet);
  const warnings: GuestWarning[] = [];
  const sheets: Sheet[] = [];

  if (layout.perSheet === 0 || rows.length === 0) {
    return { sheets, layout, warnings };
  }

  const cardSize = { w: card.widthMm, h: card.heightMm };
  const pageCount = Math.ceil(rows.length / layout.perSheet);

  for (let page = 0; page < pageCount; page++) {
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

  return { sheets, layout, warnings };
}
