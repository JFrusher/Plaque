import type { CardSpec, Point, Rect, Segment } from "../types";
import { centreOf, rotateBox, rotatePoint } from "./transform";

export type Panel = "single" | "front" | "back";

/**
 * Panel naming follows how the finished card stands up.
 *
 * Horizontal fold: the sheet is folded away from the printed side, so the
 * printing ends up on the outside of both faces. The bottom half becomes the
 * FRONT (faces the guest); the top half swings behind and lands upside down,
 * so it is the BACK and must be pre-rotated 180 degrees to read from across
 * the table. That is FR-STA-04.
 *
 * Vertical fold: the same fold turns the back panel into a MIRROR image, not a
 * rotation, and no amount of rotating fixes mirrored glyphs. So a vertical fold
 * is supported as a folded card — panels, fold guide, imposition — but
 * `invertBackPanel` does not apply to it and is ignored. The UI disables the
 * toggle rather than printing something unreadable.
 */
export function foldInversionApplies(card: CardSpec): boolean {
  return card.fold === "horizontal" && card.invertBackPanel;
}

export function panelBounds(panel: Panel, card: CardSpec): Rect {
  const { widthMm: w, heightMm: h, foldPositionMm: f } = card;
  if (card.fold === "none" || panel === "single") return { x: 0, y: 0, w, h };
  if (card.fold === "horizontal") {
    return panel === "back" ? { x: 0, y: 0, w, h: f } : { x: 0, y: f, w, h: h - f };
  }
  return panel === "front" ? { x: 0, y: 0, w: f, h } : { x: f, y: 0, w: w - f, h };
}

/** Which panel a box belongs to, decided by its centre. Never stored on the element. */
export function panelOfPoint(p: Point, card: CardSpec): Panel {
  if (card.fold === "none") return "single";
  if (card.fold === "horizontal") return p.y < card.foldPositionMm ? "back" : "front";
  return p.x < card.foldPositionMm ? "front" : "back";
}

export function panelOf(box: Rect, card: CardSpec): Panel {
  return panelOfPoint(centreOf(box), card);
}

/**
 * Maps a card-local box through the fold inversion.
 *
 * Returns the box unrotated but repositioned, plus the rotation the renderer
 * should apply about that box's own centre. Rotating the whole panel about its
 * centre by 180 sends a box's centre to `2c - centre`, and spinning the content
 * in place then completes the transform — which is why width and height are
 * untouched here.
 */
export function transformForPanel(
  box: Rect,
  card: CardSpec,
): { box: Rect; rotationDeg: number } {
  if (!foldInversionApplies(card)) return { box, rotationDeg: 0 };
  if (panelOf(box, card) !== "back") return { box, rotationDeg: 0 };
  const about = centreOf(panelBounds("back", card));
  return { box: rotateBox(box, about, 180), rotationDeg: 180 };
}

/** Point form of the same transform. `p' = 2c - p` on the back panel. */
export function transformPointForPanel(p: Point, card: CardSpec): Point {
  if (!foldInversionApplies(card)) return p;
  if (panelOfPoint(p, card) !== "back") return p;
  return rotatePoint(p, centreOf(panelBounds("back", card)), 180);
}

/** The fold line in card-local coordinates, or null when the card does not fold. */
export function foldSegment(card: CardSpec): Segment | null {
  if (card.fold === "none") return null;
  if (card.fold === "horizontal") {
    return [
      { x: 0, y: card.foldPositionMm },
      { x: card.widthMm, y: card.foldPositionMm },
    ];
  }
  return [
    { x: card.foldPositionMm, y: 0 },
    { x: card.foldPositionMm, y: card.heightMm },
  ];
}

/** Default fold position: halfway. */
export function defaultFoldPosition(card: Pick<CardSpec, "widthMm" | "heightMm" | "fold">): number {
  if (card.fold === "vertical") return card.widthMm / 2;
  return card.heightMm / 2;
}

export function foldPositionIsValid(card: CardSpec): boolean {
  if (card.fold === "none") return true;
  const span = card.fold === "vertical" ? card.widthMm : card.heightMm;
  return card.foldPositionMm > 0 && card.foldPositionMm < span;
}
