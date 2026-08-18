import type { ImageFit, Mm, Rect } from "../types";
import { fitIcon } from "./iconFit";

/** Past this the artwork is a texture, not a picture. */
export const MAX_ZOOM = 8;

export interface ImageCrop {
  fit: ImageFit;
  /** 1 exactly fills the box. Clamped to 1..MAX_ZOOM. */
  zoom?: number;
  /** Which point of the artwork sits at the centre of the box. 0..1. */
  focusX?: number;
  focusY?: number;
}

export interface ImagePlacement {
  x: Mm;
  y: Mm;
  drawnW: Mm;
  drawnH: Mm;
  /** Non-null only when the artwork is bigger than its box, so the renderers clip. */
  clip: Rect | null;
}

const clamp = (value: number, low: number, high: number) =>
  Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : low;

/**
 * Places image artwork inside its element box.
 *
 * Shared by both renderers, for the same reason `fitIcon` is: the screen and
 * the sheet must agree about where artwork lands, and the only way to be sure
 * of that is for them to run the same arithmetic.
 *
 * `cover` stores its crop as ratios — a zoom and a focal point — rather than as
 * a rectangle of the source image. That is what lets the crop survive a box
 * resize: the box is always filled, and always around the same part of the
 * picture, whatever shape it becomes.
 */
export function fitImage(
  box: Rect,
  natural: { w: number; h: number },
  crop: ImageCrop,
): ImagePlacement {
  const degenerate = box.w <= 0 || box.h <= 0 || natural.w <= 0 || natural.h <= 0;
  if (degenerate) return { x: box.x, y: box.y, drawnW: 0, drawnH: 0, clip: null };

  if (crop.fit === "stretch") {
    return { x: box.x, y: box.y, drawnW: box.w, drawnH: box.h, clip: null };
  }

  if (crop.fit === "contain") {
    const fit = fitIcon(box, { x: 0, y: 0, w: natural.w, h: natural.h });
    return { x: fit.x, y: fit.y, drawnW: fit.drawnW, drawnH: fit.drawnH, clip: null };
  }

  const zoom = clamp(crop.zoom ?? 1, 1, MAX_ZOOM);
  const scale = Math.max(box.w / natural.w, box.h / natural.h) * zoom;
  const drawnW = natural.w * scale;
  const drawnH = natural.h * scale;

  // Both slacks are <= 0 under cover, so the focal fraction runs the artwork
  // from left-pinned at 0 to right-pinned at 1, and the clamp is what makes a
  // gap unrepresentable rather than merely unlikely.
  const slackX = box.w - drawnW;
  const slackY = box.h - drawnH;
  const x = clamp(box.x + slackX * clamp(crop.focusX ?? 0.5, 0, 1), box.x + slackX, box.x);
  const y = clamp(box.y + slackY * clamp(crop.focusY ?? 0.5, 0, 1), box.y + slackY, box.y);

  return { x, y, drawnW, drawnH, clip: { ...box } };
}
