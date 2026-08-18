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

/** 300 dots per inch, the resolution the whole app assumes for artwork. */
export const PRINT_DPI = 300;

/**
 * The largest box of the given shape that fits inside `bounds`, centred.
 *
 * Backs "Fit to card" and "Fit to panel". `aspect` is width over height, or
 * `null` for a stretch fit, which has no shape to preserve.
 */
export function boxFittedTo(bounds: Rect, aspect: number | null): Rect {
  if (aspect === null || !(aspect > 0)) return { ...bounds };
  const w = Math.min(bounds.w, bounds.h * aspect);
  const h = w / aspect;
  return {
    x: bounds.x + (bounds.w - w) / 2,
    y: bounds.y + (bounds.h - h) / 2,
    w,
    h,
  };
}

/**
 * The box reshaped to `aspect` about its own centre, keeping its area.
 *
 * Area rather than width, so reshaping a long thin box does not throw it off
 * the card — and so that reshaping twice lands back where it started.
 */
export function boxWithAspect(box: Rect, aspect: number): Rect {
  if (!(aspect > 0) || box.w <= 0 || box.h <= 0) return { ...box };
  const area = box.w * box.h;
  const w = Math.sqrt(area * aspect);
  const h = w / aspect;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

/**
 * The artwork at its own size — 300dpi — about the box's centre, clamped so it
 * neither outgrows `bounds` nor lands outside them.
 */
export function boxAtNaturalSize(box: Rect, natural: { w: number; h: number }, bounds: Rect): Rect {
  if (natural.w <= 0 || natural.h <= 0) return { ...box };
  const mmPerPixel = 25.4 / PRINT_DPI;
  const full = boxFittedTo(
    { x: bounds.x, y: bounds.y, w: natural.w * mmPerPixel, h: natural.h * mmPerPixel },
    natural.w / natural.h,
  );
  const fitted = boxFittedTo(
    { x: bounds.x, y: bounds.y, w: Math.min(full.w, bounds.w), h: Math.min(full.h, bounds.h) },
    natural.w / natural.h,
  );

  const centreX = box.x + box.w / 2;
  const centreY = box.y + box.h / 2;
  return {
    x: clamp(centreX - fitted.w / 2, bounds.x, bounds.x + bounds.w - fitted.w),
    y: clamp(centreY - fitted.h / 2, bounds.y, bounds.y + bounds.h - fitted.h),
    w: fitted.w,
    h: fitted.h,
  };
}
