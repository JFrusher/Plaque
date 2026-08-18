import { panelBounds, panelOf } from "../geometry/fold";
import type { CardElement, CardSpec, ElementId, Mm, Rect } from "../types";

export type OverflowKind = "off-card" | "crosses-fold";

export interface OverflowIssue {
  elementId: ElementId;
  kind: OverflowKind;
  detail: string;
}

/** Under this, it is a rounding artefact of a drag, not something to report. */
const TOLERANCE_MM = 0.01;

/**
 * Elements that will not print the way the editor shows them (§6).
 *
 * Advisory, never blocking: bleeding artwork deliberately off the edge is a
 * real design, and so is a rule that crosses the fold on purpose. What is
 * never intended is finding out about either from the cut sheet.
 */
export function overflowIssues(elements: CardElement[], card: CardSpec): OverflowIssue[] {
  const issues: OverflowIssue[] = [];
  const cardBox: Rect = { x: 0, y: 0, w: card.widthMm, h: card.heightMm };

  for (const el of elements) {
    const box: Rect = { x: el.x, y: el.y, w: el.w, h: el.h };

    const over = overhang(box, cardBox);
    if (over > TOLERANCE_MM) {
      issues.push({
        elementId: el.id,
        kind: "off-card",
        detail: `Hangs ${round(over)}mm past the edge of the card, so that much will be cut off.`,
      });
    }

    // The panel a box belongs to is decided by its centre, so a box can be
    // "in" a panel and still lie half outside it. That is exactly the case
    // worth reporting: it prints across the crease.
    if (card.fold !== "none") {
      const panel = panelBounds(panelOf(box, card), card);
      if (overhang(box, panel) > TOLERANCE_MM) {
        issues.push({
          elementId: el.id,
          kind: "crosses-fold",
          detail: "Crosses the fold, so it will be creased down the middle.",
        });
      }
    }
  }

  return issues;
}

/** How far the worst side of `box` sticks out of `bounds`. Zero when it fits. */
function overhang(box: Rect, bounds: Rect): Mm {
  return Math.max(
    0,
    bounds.x - box.x,
    bounds.y - box.y,
    box.x + box.w - (bounds.x + bounds.w),
    box.y + box.h - (bounds.y + bounds.h),
  );
}

const round = (mm: Mm) => Math.round(mm * 10) / 10;
