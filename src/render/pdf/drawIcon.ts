import { degrees, type PDFPage, type RGB } from "pdf-lib";
import { ICON_VIEWBOX } from "../../assets/icons";
import type { Mm, Point, Rect } from "../../core/types";
import { mmToPt } from "../../core/units";
import { centreOf, rotatePoint } from "../../core/geometry/transform";

/**
 * Draws a 24x24 icon path into a box, as PDF path operators — never a bitmap.
 *
 * `drawSvgPath` anchors the path's (0,0) at the given point and then flips y, so
 * SVG coordinates run downward from the anchor. That was confirmed against the
 * emitted content stream (`1 0 0 -1 0 0 cm`) rather than assumed, and the smoke
 * test pins it.
 */
export function drawIconPath(
  page: PDFPage,
  pathD: string,
  box: Rect,
  rotationDeg: number,
  color: RGB,
  toPdf: (p: Point) => { x: number; y: number },
): void {
  const side = Math.min(box.w, box.h);
  if (side <= 0) return;

  // Square, centred in the box, so a non-square box never distorts the icon.
  const topLeft: Point = {
    x: box.x + (box.w - side) / 2,
    y: box.y + (box.h - side) / 2,
  };

  const anchor = toPdf(rotatePoint(topLeft, centreOf(box), rotationDeg));

  page.drawSvgPath(pathD, {
    x: anchor.x,
    y: anchor.y,
    scale: mmToPt(side) / ICON_VIEWBOX,
    color,
    // Scene rotation is clockwise in a y-down system; PDF rotation is
    // counter-clockwise in a y-up one.
    rotate: degrees(-rotationDeg),
  });
}

/** The side of the square an icon will occupy in a given box. */
export function iconSideMm(box: Rect): Mm {
  return Math.min(box.w, box.h);
}
