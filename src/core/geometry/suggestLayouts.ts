import { pageSizeMm } from "../units";
import type { CardRotation, CardSpec, Mm, Orientation, PageSizeName, SheetSpec } from "../types";
import { computeLayout } from "./pageLayout";

export interface SuggestOptions {
  pages?: PageSizeName[];
  /** Floor for the gap between cards. Raised automatically when bleed demands it. */
  minGapMm?: Mm;
  /** Suggestions never place a card inside this border. */
  printerMarginMm?: Mm;
  maxResults?: number;
}

export interface LayoutSuggestion {
  id: string;
  label: string;
  page: PageSizeName;
  orientation: Orientation;
  cardRotationDeg: CardRotation;
  cols: number;
  rows: number;
  perSheet: number;
  /** Share of the usable area not covered by cards, 0..1. */
  waste: number;
  /** Apply straight onto a SheetSpec to adopt the suggestion. */
  patch: Pick<
    SheetSpec,
    | "page"
    | "orientation"
    | "cardRotationDeg"
    | "marginTopMm"
    | "marginRightMm"
    | "marginBottomMm"
    | "marginLeftMm"
    | "gapXMm"
    | "gapYMm"
  >;
}

const ORIENTATIONS: Orientation[] = ["portrait", "landscape"];
const ROTATIONS: CardRotation[] = [0, 90];

/**
 * Adjacent bleeds would overlap and print into each other if the gap is
 * narrower than two bleeds, so a bled card forces the gap open.
 */
export function minimumGapMm(card: CardSpec, floor: Mm): Mm {
  return Math.max(floor, card.bleedMm * 2);
}

/**
 * Enumerates page x orientation x card rotation and ranks the combinations that
 * hold the most cards. This is the whole point of allowing arbitrary card sizes:
 * the user picks a size, the app works out how to waste the least card stock.
 */
export function suggestLayouts(card: CardSpec, opts: SuggestOptions = {}): LayoutSuggestion[] {
  const pages = opts.pages ?? (["A4", "LETTER"] as PageSizeName[]);
  const margin = opts.printerMarginMm ?? 5;
  const gap = minimumGapMm(card, opts.minGapMm ?? 5);
  const maxResults = opts.maxResults ?? 6;

  const out: LayoutSuggestion[] = [];

  for (const page of pages) {
    for (const orientation of ORIENTATIONS) {
      for (const cardRotationDeg of ROTATIONS) {
        const patch = {
          page,
          orientation,
          cardRotationDeg,
          marginTopMm: margin,
          marginRightMm: margin,
          marginBottomMm: margin,
          marginLeftMm: margin,
          gapXMm: gap,
          gapYMm: gap,
        };
        const probe: SheetSpec = {
          ...patch,
          printerMarginMm: margin,
          cropMarks: true,
          cutLines: true,
          foldGuides: true,
          bleedGuides: true,
        };
        const layout = computeLayout(card, probe);
        if (layout.perSheet === 0) continue;

        const size = pageSizeMm(page, orientation);
        const usableArea = (size.w - margin * 2) * (size.h - margin * 2);
        const cardArea = card.widthMm * card.heightMm;
        const waste = usableArea > 0 ? 1 - (layout.perSheet * cardArea) / usableArea : 1;

        out.push({
          id: `${page}-${orientation}-${cardRotationDeg}`,
          label: describe(page, orientation, cardRotationDeg, layout.cols, layout.rows, layout.perSheet),
          page,
          orientation,
          cardRotationDeg,
          cols: layout.cols,
          rows: layout.rows,
          perSheet: layout.perSheet,
          waste,
          patch,
        });
      }
    }
  }

  out.sort(
    (a, b) =>
      b.perSheet - a.perSheet ||
      a.waste - b.waste ||
      // Stable, predictable tie-breaks so the list does not reshuffle on rerender.
      orientationRank(a.orientation) - orientationRank(b.orientation) ||
      a.cardRotationDeg - b.cardRotationDeg ||
      a.page.localeCompare(b.page),
  );

  return out.slice(0, maxResults);
}

function orientationRank(o: Orientation): number {
  return o === "portrait" ? 0 : 1;
}

function describe(
  page: PageSizeName,
  orientation: Orientation,
  rotation: CardRotation,
  cols: number,
  rows: number,
  perSheet: number,
): string {
  const name = page === "A4" ? "A4" : "Letter";
  const turned = rotation === 90 ? ", cards turned" : "";
  return `${name} ${orientation}${turned} — ${cols} × ${rows}, ${perSheet} per sheet`;
}
