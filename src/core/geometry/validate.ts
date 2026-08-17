import { pageSizeMm } from "../units";
import type { CardSpec, SheetSpec } from "../types";
import { MARK_LENGTH_MM } from "./cropMarks";
import { foldPositionIsValid } from "./fold";
import { computeLayout, usableSize } from "./pageLayout";

export type Severity = "error" | "warning";

export interface Issue {
  id: string;
  severity: Severity;
  message: string;
}

/**
 * Geometry problems the user should see before they waste card stock.
 *
 * `error` means the sheet cannot be produced as configured. `warning` means it
 * will produce something, but probably not what was wanted. Nothing here
 * blocks — the user is allowed to override every one of these.
 */
/**
 * `printer` carries what the user has actually measured about their machine
 * (B4). When present its unprintable border replaces the advisory default on the
 * sheet, because a measured margin beats a guess — and its name goes in the
 * message so the warning is about a real printer rather than printers in general.
 */
export interface ValidateContext {
  printerName?: string;
  unprintableMarginMm?: number | null;
}

export function validateGeometry(
  card: CardSpec,
  sheet: SheetSpec,
  printer: ValidateContext = {},
): Issue[] {
  const issues: Issue[] = [];
  const page = pageSizeMm(sheet.page, sheet.orientation);
  const usable = usableSize(sheet);
  const layout = computeLayout(card, sheet);

  if (card.widthMm <= 0 || card.heightMm <= 0) {
    issues.push({
      id: "card-size",
      severity: "error",
      message: "Card width and height must both be greater than zero.",
    });
  }

  if (card.bleedMm < 0) {
    issues.push({ id: "bleed-negative", severity: "error", message: "Bleed cannot be negative." });
  }

  if (usable.w <= 0 || usable.h <= 0) {
    issues.push({
      id: "margins-exceed-page",
      severity: "error",
      message: "Margins leave no room on the page. Reduce them.",
    });
  } else if (layout.perSheet === 0) {
    issues.push({
      id: "no-fit",
      severity: "error",
      message: `A ${fmt(layout.footprint.w)} × ${fmt(layout.footprint.h)}mm card does not fit in the ${fmt(usable.w)} × ${fmt(usable.h)}mm printable area. Try a smaller card, smaller margins, landscape, or turning the cards.`,
    });
  }

  if (!foldPositionIsValid(card)) {
    const span = card.fold === "vertical" ? card.widthMm : card.heightMm;
    issues.push({
      id: "fold-position",
      severity: "error",
      message: `The fold must sit between 0 and ${fmt(span)}mm.`,
    });
  }

  if (card.fold === "vertical" && card.invertBackPanel) {
    issues.push({
      id: "vertical-fold-inversion",
      severity: "warning",
      message:
        "A vertical fold mirrors the back panel rather than rotating it, so back-panel inversion does not apply and is being ignored.",
    });
  }

  if (card.bleedMm > 0) {
    const need = card.bleedMm * 2;
    if (sheet.gapXMm < need || sheet.gapYMm < need) {
      issues.push({
        id: "bleed-overlap",
        severity: "warning",
        message: `Neighbouring bleeds overlap. With ${fmt(card.bleedMm)}mm bleed the gap needs to be at least ${fmt(need)}mm.`,
      });
    }
  }

  const minMargin = Math.min(
    sheet.marginTopMm,
    sheet.marginRightMm,
    sheet.marginBottomMm,
    sheet.marginLeftMm,
  );
  const measured =
    typeof printer.unprintableMarginMm === "number" && Number.isFinite(printer.unprintableMarginMm)
      ? printer.unprintableMarginMm
      : null;
  const unprintable = Math.max(sheet.printerMarginMm, measured ?? 0);
  if (minMargin < unprintable) {
    const whose =
      measured !== null && measured >= sheet.printerMarginMm
        ? `${printer.printerName ?? "your printer"} cannot reach`
        : "your printer probably cannot reach";
    issues.push({
      id: "printer-margin",
      severity: "warning",
      message: `A margin of ${fmt(minMargin)}mm is inside the ${fmt(unprintable)}mm ${whose}. Content there may be clipped.`,
    });
  }

  // The fold guide is the one mark whose position the user cannot fudge after
  // printing: fold on a clipped guide and every card is folded in the wrong place.
  if (sheet.foldGuides && card.fold !== "none" && layout.perSheet > 0) {
    const foldFromEdge =
      card.fold === "horizontal"
        ? Math.min(sheet.marginTopMm + card.foldPositionMm, sheet.marginBottomMm + (card.heightMm - card.foldPositionMm))
        : Math.min(sheet.marginLeftMm + card.foldPositionMm, sheet.marginRightMm + (card.widthMm - card.foldPositionMm));
    if (foldFromEdge < unprintable) {
      issues.push({
        id: "fold-guide-clipped",
        severity: "warning",
        message: `A fold guide sits ${fmt(foldFromEdge)}mm from the paper edge, inside the ${fmt(unprintable)}mm this printer cannot reach. It will not print, and a fold guessed by eye is a card folded in the wrong place.`,
      });
    }
  }

  if (card.bleedMm > 0 && minMargin < card.bleedMm + unprintable) {
    issues.push({
      id: "bleed-clipped",
      severity: "warning",
      message: `${fmt(card.bleedMm)}mm of bleed plus a ${fmt(unprintable)}mm unprintable border needs ${fmt(card.bleedMm + unprintable)}mm of margin. The bleed on the outer cards will be cut short by the printer, not by you.`,
    });
  }

  if (sheet.cropMarks && minMargin < card.bleedMm + MARK_LENGTH_MM) {
    issues.push({
      id: "crop-marks-clipped",
      severity: "warning",
      message: `Crop marks need ${fmt(card.bleedMm + MARK_LENGTH_MM)}mm of margin to sit fully on the page. Some will run off the edge.`,
    });
  }

  if (card.widthMm > page.w || card.heightMm > page.h) {
    if (!(sheet.cardRotationDeg === 90 && card.heightMm <= page.w && card.widthMm <= page.h)) {
      issues.push({
        id: "card-larger-than-page",
        severity: "warning",
        message: "The card is bigger than the page in at least one direction.",
      });
    }
  }

  return issues;
}

export function hasErrors(issues: Issue[]): boolean {
  return issues.some((i) => i.severity === "error");
}

function fmt(n: number): string {
  return String(Math.round(n * 100) / 100);
}
