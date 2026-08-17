import { PDFDocument, degrees, rgb, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import { HAIRLINE_PT } from "../../core/geometry/cropMarks";
import { centreOf, rotatePoint } from "../../core/geometry/transform";
import { fitIcon } from "../../core/template/iconFit";
import { layoutLines } from "../../core/text/layout";
import type { LoadedFont } from "../../core/text/measure";
import type { Hex, Mm, Point, ResolvedElement, Segment, Sheet } from "../../core/types";
import { mmToPt } from "../../core/units";
import { drawIconPath } from "./drawIcon";
import { embedFonts } from "./embedFonts";

export interface RenderPdfOptions {
  sheets: Sheet[];
  /** Keyed by fontId. Every text element's font must be present. */
  fonts: Map<string, LoadedFont>;
  title?: string;
}

export interface RenderPdfResult {
  bytes: Uint8Array;
  pageCount: number;
  notSubset: string[];
}

/**
 * The scene graph is top-left origin with y increasing downward. PDF is
 * bottom-left origin with y increasing upward.
 *
 * This function is the only place in Plaque that knows that. Nothing else —
 * not core/, not the SVG renderer, not the store — may flip a y coordinate.
 */
function makeToPdf(pageHeightMm: Mm) {
  return (p: Point) => ({ x: mmToPt(p.x), y: mmToPt(pageHeightMm - p.y) });
}

export async function renderPdf(opts: RenderPdfOptions): Promise<RenderPdfResult> {
  const doc = await PDFDocument.create();
  doc.setTitle(opts.title ?? "Place cards");
  doc.setProducer("Plaque");
  doc.setCreator("Plaque");

  const { fonts: embedded, notSubset } = await embedFonts(doc, opts.fonts.values());
  const images = await embedImages(doc, opts.sheets);

  for (const sheet of opts.sheets) {
    const page = doc.addPage([mmToPt(sheet.pageWidthMm), mmToPt(sheet.pageHeightMm)]);
    const toPdf = makeToPdf(sheet.pageHeightMm);

    for (const card of sheet.cards) {
      if (card.scene.backgroundHex) {
        drawRect(
          page,
          { x: card.origin.x, y: card.origin.y, w: card.footprint.w, h: card.footprint.h },
          0,
          hexToRgb(card.scene.backgroundHex),
          null,
          0,
          false,
          toPdf,
        );
      }
      for (const el of card.scene.elements) {
        drawElement(page, el, opts.fonts, embedded, images, toPdf);
      }
    }

    // Guides last so a card background can never bury the marks the cutter needs.
    const hairline = HAIRLINE_PT;
    const guideColor = rgb(0, 0, 0);
    for (const seg of sheet.guides.cropMarks) drawSegment(page, seg, hairline, guideColor, null, toPdf);
    for (const seg of sheet.guides.cutLines) drawSegment(page, seg, hairline, guideColor, null, toPdf);
    for (const seg of sheet.guides.foldGuides) {
      drawSegment(page, seg, hairline, guideColor, [3, 3], toPdf);
    }
    // guides.bleedBoxes is deliberately not drawn — it is a screen-only aid.
  }

  const bytes = await doc.save();
  return { bytes, pageCount: opts.sheets.length, notSubset };
}

function drawElement(
  page: PDFPage,
  el: ResolvedElement,
  metrics: Map<string, LoadedFont>,
  embedded: Map<string, import("pdf-lib").PDFFont>,
  images: Map<string, PDFImage>,
  toPdf: (p: Point) => { x: number; y: number },
): void {
  const box = { x: el.x, y: el.y, w: el.w, h: el.h };

  switch (el.kind) {
    case "text": {
      const font = metrics.get(el.fontId);
      const pdfFont = embedded.get(el.fontId);
      if (!font || !pdfFont || el.lines.length === 0) return;

      const lines = layoutLines(font, {
        lines: el.lines,
        fontSizePt: el.fontSizePt,
        lineHeight: el.lineHeight,
        align: el.align,
        vAlign: el.vAlign,
        anchor: el.anchor,
        letterSpacingMm: el.letterSpacingMm,
        w: el.w,
        h: el.h,
      });

      const centre = centreOf(box);
      for (const line of lines) {
        // Baselines come back element-local; lift them into sheet space, spin
        // them about the element's centre, then flip once into PDF space.
        const scene = { x: box.x + line.baseline.x, y: box.y + line.baseline.y };
        const anchor = toPdf(rotatePoint(scene, centre, el.rotationDeg));
        page.drawText(line.text, {
          x: anchor.x,
          y: anchor.y,
          size: el.fontSizePt,
          font: pdfFont,
          color: hexToRgb(el.colorHex),
          rotate: degrees(-el.rotationDeg),
          ...(el.letterSpacingMm ? { characterSpacing: mmToPt(el.letterSpacingMm) } : {}),
        });
      }
      return;
    }

    case "icon":
      if (!el.pathD) return;
      drawIconPath(page, el.pathD, box, el.view, el.rotationDeg, hexToRgb(el.colorHex), toPdf);
      // The knockout goes on top, in the card's own background colour.
      if (el.cutD) {
        drawIconPath(page, el.cutD, box, el.view, el.rotationDeg, hexToRgb(el.cutHex), toPdf);
      }
      return;

    case "image": {
      if (!el.image) return;
      const embeddedImage = images.get(el.image.id);
      if (!embeddedImage) return;
      const placed =
        el.fit === "stretch"
          ? { x: box.x, y: box.y, drawnW: box.w, drawnH: box.h }
          : fitIcon(box, { x: 0, y: 0, w: el.image.naturalW, h: el.image.naturalH });
      // pdf-lib anchors an image at its bottom-left, as it does a rectangle.
      const corner = { x: placed.x, y: placed.y + placed.drawnH };
      const anchor = toPdf(rotatePoint(corner, centreOf(box), el.rotationDeg));
      page.drawImage(embeddedImage, {
        x: anchor.x,
        y: anchor.y,
        width: mmToPt(placed.drawnW),
        height: mmToPt(placed.drawnH),
        rotate: degrees(-el.rotationDeg),
        opacity: el.opacity,
      });
      return;
    }

    case "rect":
      drawRect(
        page,
        box,
        el.rotationDeg,
        el.fillHex ? hexToRgb(el.fillHex) : null,
        el.strokeHex ? hexToRgb(el.strokeHex) : null,
        mmToPt(el.strokeWidthMm),
        el.dashed,
        toPdf,
      );
      return;

    case "line": {
      // A line runs along the longer axis of its box, so dragging out a wide
      // thin box gives a rule and a tall thin one gives a vertical rule.
      const horizontal = el.w >= el.h;
      const local: Segment = horizontal
        ? [
            { x: box.x, y: box.y + box.h / 2 },
            { x: box.x + box.w, y: box.y + box.h / 2 },
          ]
        : [
            { x: box.x + box.w / 2, y: box.y },
            { x: box.x + box.w / 2, y: box.y + box.h },
          ];
      const centre = centreOf(box);
      const spun: Segment = [
        rotatePoint(local[0], centre, el.rotationDeg),
        rotatePoint(local[1], centre, el.rotationDeg),
      ];
      drawSegment(
        page,
        spun,
        mmToPt(el.strokeWidthMm),
        hexToRgb(el.strokeHex),
        el.dashed ? [3, 3] : null,
        toPdf,
      );
      return;
    }
  }
}

/**
 * Embeds each distinct image once per document, however many cards use it.
 * A crest repeated on 150 cards must not become 150 copies of the same bytes.
 */
async function embedImages(doc: PDFDocument, sheets: Sheet[]): Promise<Map<string, PDFImage>> {
  const wanted = new Map<string, { data: Uint8Array; mime: string }>();
  for (const sheet of sheets) {
    for (const card of sheet.cards) {
      for (const el of card.scene.elements) {
        if (el.kind === "image" && el.image && !wanted.has(el.image.id)) {
          wanted.set(el.image.id, { data: el.image.data, mime: el.image.mime });
        }
      }
    }
  }

  const out = new Map<string, PDFImage>();
  for (const [id, { data, mime }] of wanted) {
    try {
      out.set(id, mime === "image/png" ? await doc.embedPng(data) : await doc.embedJpg(data));
    } catch {
      // A corrupt image should cost its own element, not the whole export.
    }
  }
  return out;
}

function drawRect(
  page: PDFPage,
  box: { x: Mm; y: Mm; w: Mm; h: Mm },
  rotationDeg: number,
  fill: RGB | null,
  stroke: RGB | null,
  strokeWidthPt: number,
  dashed: boolean,
  toPdf: (p: Point) => { x: number; y: number },
): void {
  if (!fill && !stroke) return;
  // pdf-lib anchors a rectangle at its bottom-left and extends up and right,
  // which in scene coordinates is the box's bottom-left corner.
  const corner = { x: box.x, y: box.y + box.h };
  const anchor = toPdf(rotatePoint(corner, centreOf(box), rotationDeg));
  page.drawRectangle({
    x: anchor.x,
    y: anchor.y,
    width: mmToPt(box.w),
    height: mmToPt(box.h),
    rotate: degrees(-rotationDeg),
    ...(fill ? { color: fill } : { opacity: 0 }),
    ...(stroke ? { borderColor: stroke, borderWidth: strokeWidthPt } : {}),
    ...(stroke && dashed ? { borderDashArray: [3, 3] } : {}),
  });
}

function drawSegment(
  page: PDFPage,
  seg: Segment,
  thicknessPt: number,
  color: RGB,
  dashArray: number[] | null,
  toPdf: (p: Point) => { x: number; y: number },
): void {
  page.drawLine({
    start: toPdf(seg[0]),
    end: toPdf(seg[1]),
    thickness: thicknessPt,
    color,
    ...(dashArray ? { dashArray } : {}),
  });
}

export function hexToRgb(hex: Hex): RGB {
  const clean = hex.replace("#", "").trim();
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const n = Number.parseInt(full, 16);
  if (full.length !== 6 || Number.isNaN(n)) return rgb(0, 0, 0);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
