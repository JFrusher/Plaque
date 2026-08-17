import type { CardRotation, Point, Rect, Size } from "../types";

/**
 * Rotations in Plaque are always multiples of 90 degrees, so the trig is done
 * with an exact table rather than Math.cos/Math.sin. Floating point cos(90deg)
 * is 6.1e-17, not zero, and that dust accumulates into visible drift once it
 * has been through a fold transform and a sheet placement.
 *
 * Positive degrees rotate clockwise, matching a y-down coordinate system.
 */
function cosSin(deg: number): readonly [number, number] {
  const q = ((Math.round(deg / 90) % 4) + 4) % 4;
  switch (q) {
    case 1:
      return [0, 1];
    case 2:
      return [-1, 0];
    case 3:
      return [0, -1];
    default:
      return [1, 0];
  }
}

export function rotatePoint(p: Point, about: Point, deg: number): Point {
  const [c, s] = cosSin(deg);
  const dx = p.x - about.x;
  const dy = p.y - about.y;
  return {
    x: about.x + dx * c - dy * s,
    y: about.y + dx * s + dy * c,
  };
}

export function centreOf(b: Rect): Point {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

export function boxFromCentre(centre: Point, w: number, h: number): Rect {
  return { x: centre.x - w / 2, y: centre.y - h / 2, w, h };
}

/**
 * Moves a box so that rotating its content by `deg` about its own centre lands
 * where a full rotation about `about` would put it. Width and height are
 * preserved deliberately: the renderer receives an unrotated box plus a
 * rotation, and spins the content itself.
 */
export function rotateBox(b: Rect, about: Point, deg: number): Rect {
  return boxFromCentre(rotatePoint(centreOf(b), about, deg), b.w, b.h);
}

/** The area a card occupies on the sheet once on-sheet rotation is applied. */
export function cardFootprint(card: Size, rotation: CardRotation): Size {
  return rotation === 90 ? { w: card.h, h: card.w } : { w: card.w, h: card.h };
}

/**
 * Maps a card-local box into sheet coordinates, honouring on-sheet card
 * rotation. `origin` is the top-left of the card's footprint on the sheet.
 *
 * At rotation 90 the card is turned clockwise about its centre and then nudged
 * so its footprint's top-left sits back on `origin`; card-local (0,0) lands at
 * the footprint's top-right.
 */
export function cardToSheet(
  box: Rect,
  card: Size,
  rotation: CardRotation,
  origin: Point,
): Rect {
  if (rotation === 0) {
    return { x: origin.x + box.x, y: origin.y + box.y, w: box.w, h: box.h };
  }
  const cardCentre = { x: card.w / 2, y: card.h / 2 };
  const rotated = rotateBox(box, cardCentre, 90);
  // Bring the rotated footprint's top-left corner back to (0,0), then translate.
  const offsetX = (card.h - card.w) / 2;
  const offsetY = (card.w - card.h) / 2;
  return {
    x: origin.x + rotated.x + offsetX,
    y: origin.y + rotated.y + offsetY,
    w: rotated.w,
    h: rotated.h,
  };
}

/** Same mapping as `cardToSheet`, for a bare point (fold guides, crop marks). */
export function cardPointToSheet(
  p: Point,
  card: Size,
  rotation: CardRotation,
  origin: Point,
): Point {
  if (rotation === 0) return { x: origin.x + p.x, y: origin.y + p.y };
  const rotated = rotatePoint(p, { x: card.w / 2, y: card.h / 2 }, 90);
  return {
    x: origin.x + rotated.x + (card.h - card.w) / 2,
    y: origin.y + rotated.y + (card.w - card.h) / 2,
  };
}
