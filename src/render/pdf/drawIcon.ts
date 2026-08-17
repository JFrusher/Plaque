import { degrees, type PDFPage, type RGB } from "pdf-lib";
import { centreOf, rotatePoint } from "../../core/geometry/transform";
import { fitIcon } from "../../core/template/iconFit";
import type { Mm, Point, Rect } from "../../core/types";
import { mmToPt } from "../../core/units";

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
  view: { x: Mm; y: Mm; w: Mm; h: Mm },
  rotationDeg: number,
  color: RGB,
  toPdf: (p: Point) => { x: number; y: number },
): void {
  const fit = fitIcon(box, view);
  if (fit.scale <= 0) return;

  // The path's own origin, once its viewBox offset is taken out.
  const origin: Point = {
    x: fit.x - view.x * fit.scale,
    y: fit.y - view.y * fit.scale,
  };
  const anchor = toPdf(rotatePoint(origin, centreOf(box), rotationDeg));

  page.drawSvgPath(pathD, {
    x: anchor.x,
    y: anchor.y,
    scale: mmToPt(fit.scale),
    color,
    // Scene rotation is clockwise in a y-down system; PDF rotation is
    // counter-clockwise in a y-up one.
    rotate: degrees(-rotationDeg),
  });
}
