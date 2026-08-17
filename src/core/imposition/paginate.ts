import { cardGuides } from "../geometry/cropMarks";
import { cardOriginOnSheet, computeLayout, type PageLayout } from "../geometry/pageLayout";
import { cardToSheet } from "../geometry/transform";
import { resolveCard, type CardWarning, type ResolveOptions } from "../template/bindings";
import type { Artefact } from "../data/artefacts";
import { templateForRow } from "../template/overrides";
import type { CardSpec, ResolvedElement, Sheet, SheetGuides, SheetSpec, Template } from "../types";

export interface GuestWarning extends CardWarning {
  /** Index into the artefact list, which for per-row scope is the row index. */
  artefactIndex: number;
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

/** Sheets the whole job needs, without building any of them. */
export function sheetCountFor(
  artefactCount: number,
  card: CardSpec,
  sheet: SheetSpec,
): number {
  const perSheet = computeLayout(card, sheet).perSheet;
  return perSheet === 0 || artefactCount === 0 ? 0 : Math.ceil(artefactCount / perSheet);
}

export interface ArtefactAnalysis {
  warnings: GuestWarning[];
  /**
   * Typographic headroom per artefact, 0..1: 1 means everything printed at the
   * size asked for, 0 means it overflowed even at the floor. This is the fit
   * heatmap's data (D4), and it falls out of the pass that was already
   * happening — spotting the six problem names in 2000 rows should not cost a
   * second traversal.
   */
  headroom: number[];
}

/**
 * Warnings and fit headroom for every artefact, without imposing anything.
 *
 * Separated from `paginate` so the editor can show one sheet cheaply while the
 * full "these names do not fit" pass runs at a lower priority.
 */
export function analyseArtefacts(
  template: Template,
  artefacts: Artefact[],
  card: CardSpec,
  opts: ResolveOptions,
): ArtefactAnalysis {
  const warnings: GuestWarning[] = [];
  const headroom: number[] = [];

  for (const [artefactIndex, artefact] of artefacts.entries()) {
    const resolved = resolveCard(
      templateForRow(template, artefact.rowId),
      artefact.row,
      card,
      opts,
      artefact.rows,
    );
    for (const w of resolved.warnings) warnings.push({ ...w, artefactIndex });
    headroom.push(headroomOf(template, resolved.scene.elements));
  }

  return { warnings, headroom };
}

/**
 * The tightest text on the card: fitted size over requested size, or 0 when it
 * overflowed. One number per artefact is what makes a 2000-row strip readable.
 */
function headroomOf(template: Template, elements: ResolvedElement[]): number {
  let tightest = 1;
  for (const el of elements) {
    if (el.kind !== "text") continue;
    if (el.overflowed) return 0;
    const source = template.elements.find((candidate) => candidate.id === el.id);
    const requested =
      source && (source.kind === "text" || source.kind === "list") ? source.fontSizePt : el.fontSizePt;
    if (requested > 0) tightest = Math.min(tightest, el.fontSizePt / requested);
  }
  return tightest;
}

/**
 * Lays every artefact out across as many sheets as it takes.
 *
 * This is where card-local coordinates become sheet coordinates. On-sheet card
 * rotation is folded into each element's own rotation here, so a renderer only
 * ever sees "a box at these millimetres, spun this far about its centre".
 */
export function paginate(
  template: Template,
  artefacts: Artefact[],
  card: CardSpec,
  sheet: SheetSpec,
  opts: ResolveOptions,
  options: PaginateOptions = {},
): PaginateResult {
  const layout = computeLayout(card, sheet);
  const warnings: GuestWarning[] = [];
  const sheets: Sheet[] = [];

  if (layout.perSheet === 0 || artefacts.length === 0) {
    return { sheets, layout, sheetCount: 0, warnings };
  }

  const cardSize = { w: card.widthMm, h: card.heightMm };
  const pageCount = Math.ceil(artefacts.length / layout.perSheet);
  const from = Math.max(0, options.pages?.from ?? 0);
  const to = Math.min(pageCount - 1, options.pages?.to ?? pageCount - 1);

  for (let page = from; page <= to; page++) {
    const guides: SheetGuides = { cropMarks: [], cutLines: [], foldGuides: [], bleedBoxes: [] };
    const cards: Sheet["cards"] = [];

    for (let slot = 0; slot < layout.perSheet; slot++) {
      const artefactIndex = page * layout.perSheet + slot;
      const artefact = artefacts[artefactIndex];
      if (!artefact) break;

      const origin = cardOriginOnSheet(slot, layout);
      // Per-row overrides are applied here, once, so neither renderer nor the
      // fitter needs to know they exist (D1).
      const resolved = resolveCard(
        templateForRow(template, artefact.rowId),
        artefact.row,
        card,
        opts,
        artefact.rows,
      );
      for (const w of resolved.warnings) warnings.push({ ...w, artefactIndex });

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
        artefactIndex,
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
