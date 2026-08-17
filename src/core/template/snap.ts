import { foldSegment } from "../geometry/fold";
import type { CardElement, CardSpec, ElementId, Mm, Rect } from "../types";

export interface SnapTargets {
  xs: Mm[];
  ys: Mm[];
}

/** Lines worth snapping to: the card's own edges and centre, the fold, and every other element. */
export function snapTargetsFor(
  card: CardSpec,
  elements: CardElement[],
  excludeId: ElementId | null,
): SnapTargets {
  const xs = [0, card.widthMm / 2, card.widthMm];
  const ys = [0, card.heightMm / 2, card.heightMm];

  const fold = foldSegment(card);
  if (fold) {
    if (card.fold === "horizontal") ys.push(fold[0].y);
    else xs.push(fold[0].x);
  }

  for (const el of elements) {
    if (el.id === excludeId) continue;
    xs.push(el.x, el.x + el.w / 2, el.x + el.w);
    ys.push(el.y, el.y + el.h / 2, el.y + el.h);
  }

  return { xs: dedupe(xs), ys: dedupe(ys) };
}

/** The nearest target within the threshold, or null. */
export function nearest(value: Mm, targets: Mm[], thresholdMm: Mm): Mm | null {
  let best: Mm | null = null;
  let bestDistance = thresholdMm;
  for (const t of targets) {
    const d = Math.abs(t - value);
    if (d <= bestDistance) {
      best = t;
      bestDistance = d;
    }
  }
  return best;
}

export interface SnapResult {
  box: Rect;
  /** Lines that actually caught, for drawing snap indicators. */
  hitXs: Mm[];
  hitYs: Mm[];
}

/**
 * Snaps a box being MOVED by translating it whole.
 *
 * All three anchors on each axis — leading edge, centre, trailing edge — are
 * candidates, and the closest wins. Moving snaps by translation so the box never
 * changes size just because it drifted near a guide.
 */
export function snapMove(box: Rect, targets: SnapTargets, thresholdMm: Mm): SnapResult {
  const dx = bestOffset([box.x, box.x + box.w / 2, box.x + box.w], targets.xs, thresholdMm);
  const dy = bestOffset([box.y, box.y + box.h / 2, box.y + box.h], targets.ys, thresholdMm);
  return {
    box: { x: box.x + (dx?.delta ?? 0), y: box.y + (dy?.delta ?? 0), w: box.w, h: box.h },
    hitXs: dx ? [dx.target] : [],
    hitYs: dy ? [dy.target] : [],
  };
}

/**
 * Snaps a box being RESIZED. Only the edges that moved are snapped, so dragging
 * the right handle never quietly shifts the left one.
 */
export function snapResize(
  box: Rect,
  targets: SnapTargets,
  thresholdMm: Mm,
  edges: { left?: boolean; right?: boolean; top?: boolean; bottom?: boolean },
): SnapResult {
  let { x, y, w, h } = box;
  const hitXs: Mm[] = [];
  const hitYs: Mm[] = [];

  if (edges.left) {
    const t = nearest(x, targets.xs, thresholdMm);
    if (t !== null) {
      w += x - t;
      x = t;
      hitXs.push(t);
    }
  }
  if (edges.right) {
    const t = nearest(x + w, targets.xs, thresholdMm);
    if (t !== null) {
      w = t - x;
      hitXs.push(t);
    }
  }
  if (edges.top) {
    const t = nearest(y, targets.ys, thresholdMm);
    if (t !== null) {
      h += y - t;
      y = t;
      hitYs.push(t);
    }
  }
  if (edges.bottom) {
    const t = nearest(y + h, targets.ys, thresholdMm);
    if (t !== null) {
      h = t - y;
      hitYs.push(t);
    }
  }

  return { box: { x, y, w, h }, hitXs, hitYs };
}

/** Smallest element size, so a box can never be dragged to nothing. */
export const MIN_SIZE_MM = 2;

export function clampBox(box: Rect): Rect {
  return {
    x: box.x,
    y: box.y,
    w: Math.max(MIN_SIZE_MM, box.w),
    h: Math.max(MIN_SIZE_MM, box.h),
  };
}

function bestOffset(
  anchors: Mm[],
  targets: Mm[],
  thresholdMm: Mm,
): { delta: Mm; target: Mm } | null {
  let best: { delta: Mm; target: Mm } | null = null;
  for (const anchor of anchors) {
    const t = nearest(anchor, targets, thresholdMm);
    if (t === null) continue;
    const delta = t - anchor;
    if (!best || Math.abs(delta) < Math.abs(best.delta)) best = { delta, target: t };
  }
  return best;
}

function dedupe(values: Mm[]): Mm[] {
  return [...new Set(values.map((v) => Math.round(v * 1000) / 1000))].sort((a, b) => a - b);
}
