import type { Mm, Rect } from "../types";

export interface IconFit {
  /** Top-left of the drawn artwork, in the same space as the element box. */
  x: Mm;
  y: Mm;
  scale: number;
  drawnW: Mm;
  drawnH: Mm;
}

/**
 * Fits icon artwork into its element box, preserving aspect and centring.
 *
 * Shared by both renderers so an uploaded icon with an unusual viewBox lands in
 * exactly the same place on screen as it does on paper.
 */
export function fitIcon(box: Rect, view: { x: Mm; y: Mm; w: Mm; h: Mm }): IconFit {
  if (view.w <= 0 || view.h <= 0 || box.w <= 0 || box.h <= 0) {
    return { x: box.x, y: box.y, scale: 0, drawnW: 0, drawnH: 0 };
  }
  const scale = Math.min(box.w / view.w, box.h / view.h);
  const drawnW = view.w * scale;
  const drawnH = view.h * scale;
  return {
    x: box.x + (box.w - drawnW) / 2,
    y: box.y + (box.h - drawnH) / 2,
    scale,
    drawnW,
    drawnH,
  };
}
