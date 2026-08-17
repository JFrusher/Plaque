import type { CardSide, Mm, Point, Segment, Sheet, Template } from "../types";

/**
 * Which paper edge the printer flips the sheet about between sides.
 *
 * A mechanical property of the printer, not of the design, which is why it lives
 * on PrinterProfile. Getting it wrong puts every card's back on the wrong card —
 * a whole run wasted, silently (S-D2.2).
 */
export type FlipEdge = "long" | "short";

export type MirrorAxis = "x" | "y";

/** Elements on one side, in one template, ready for `resolveCard`. */
export function templateForSide(template: Template, side: CardSide): Template {
  return { ...template, elements: template.elements.filter((el) => sideOf(el) === side) };
}

export function sideOf(element: { side?: CardSide }): CardSide {
  return element.side ?? "front";
}

export function hasBackSide(template: Template): boolean {
  return template.elements.some((el) => sideOf(el) === "back");
}

/**
 * Which way the back sheet has to be mirrored.
 *
 * Think of the paper physically: it turns about the edge that stays still. A
 * portrait sheet flipped about its long edge turns about a VERTICAL line, so x
 * mirrors. The same flip on a landscape sheet turns about a horizontal line, so
 * y mirrors instead — which is why this depends on the page shape and not the
 * flip edge alone.
 */
export function mirrorAxisFor(flipEdge: FlipEdge, pageWidthMm: Mm, pageHeightMm: Mm): MirrorAxis {
  const longEdgeIsVertical = pageHeightMm >= pageWidthMm;
  const flipAboutLong = flipEdge === "long";
  return flipAboutLong === longEdgeIsVertical ? "x" : "y";
}

/**
 * Mirrors the POSITIONS of the cards on a sheet, never their contents.
 *
 * Each card is translated to its mirrored slot, and everything inside it moves
 * with it. Reflecting the content would print mirror-image text; what duplex
 * needs is for card 1's back to land behind card 1's front, the right way up.
 */
export function mirrorSheet(sheet: Sheet, axis: MirrorAxis): Sheet {
  const mirroredOrigin = (origin: Point, footprintW: Mm, footprintH: Mm): Point =>
    axis === "x"
      ? { x: sheet.pageWidthMm - origin.x - footprintW, y: origin.y }
      : { x: origin.x, y: sheet.pageHeightMm - origin.y - footprintH };

  const cards = sheet.cards.map((card) => {
    const origin = mirroredOrigin(card.origin, card.footprint.w, card.footprint.h);
    const dx = origin.x - card.origin.x;
    const dy = origin.y - card.origin.y;
    return {
      ...card,
      origin,
      scene: {
        ...card.scene,
        elements: card.scene.elements.map((el) => ({ ...el, x: el.x + dx, y: el.y + dy })),
      },
    };
  });

  // Guides are page furniture, so they mirror as geometry rather than moving
  // with a card: the cutter works from the front, but the marks have to be in
  // the same physical place on both sides or trimming shifts the backs.
  const point = (p: Point): Point =>
    axis === "x"
      ? { x: sheet.pageWidthMm - p.x, y: p.y }
      : { x: p.x, y: sheet.pageHeightMm - p.y };
  const segment = (s: Segment): Segment => [point(s[0]), point(s[1])];

  return {
    ...sheet,
    cards,
    guides: {
      cropMarks: sheet.guides.cropMarks.map(segment),
      cutLines: sheet.guides.cutLines.map(segment),
      foldGuides: sheet.guides.foldGuides.map(segment),
      bleedBoxes: sheet.guides.bleedBoxes.map((box) => {
        const at = point({ x: box.x, y: box.y });
        return axis === "x"
          ? { x: at.x - box.w, y: box.y, w: box.w, h: box.h }
          : { x: box.x, y: at.y - box.h, w: box.w, h: box.h };
      }),
    },
  };
}

/**
 * Nudges a whole sheet, used to correct duplex registration.
 *
 * No consumer duplex unit puts the second side down in exactly the same place as
 * the first; a millimetre or two of drift is normal. The user measures it once
 * off the duplex test sheet and every back page is corrected by it thereafter.
 * Positive dx moves the content right, positive dy moves it down.
 */
export function offsetSheet(sheet: Sheet, dxMm: Mm, dyMm: Mm): Sheet {
  if (dxMm === 0 && dyMm === 0) return sheet;

  const point = (p: Point): Point => ({ x: p.x + dxMm, y: p.y + dyMm });
  const segment = (s: Segment): Segment => [point(s[0]), point(s[1])];

  return {
    ...sheet,
    cards: sheet.cards.map((card) => ({
      ...card,
      origin: point(card.origin),
      scene: {
        ...card.scene,
        elements: card.scene.elements.map((el) => ({ ...el, x: el.x + dxMm, y: el.y + dyMm })),
      },
    })),
    guides: {
      cropMarks: sheet.guides.cropMarks.map(segment),
      cutLines: sheet.guides.cutLines.map(segment),
      foldGuides: sheet.guides.foldGuides.map(segment),
      bleedBoxes: sheet.guides.bleedBoxes.map((box) => ({ ...box, ...point(box) })),
    },
  };
}

/**
 * Front, back, front, back — the order a duplex printer expects, with page
 * numbers reassigned so each page carries its own slug line.
 *
 * A front with no matching back still gets a blank back page: dropping it would
 * put the next card's back on this card's front.
 */
export function interleave(fronts: Sheet[], backs: Sheet[]): Sheet[] {
  const out: Sheet[] = [];
  for (const [i, front] of fronts.entries()) {
    const back = backs[i];
    out.push(front);
    out.push(back ?? blankLike(front));
  }
  return out.map((sheet, index) => ({ ...sheet, index }));
}

function blankLike(sheet: Sheet): Sheet {
  return {
    ...sheet,
    cards: [],
    guides: { cropMarks: [], cutLines: [], foldGuides: [], bleedBoxes: [] },
  };
}
