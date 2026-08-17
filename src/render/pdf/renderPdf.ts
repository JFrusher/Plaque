import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  type PDFImage,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import { HAIRLINE_PT } from "../../core/geometry/cropMarks";
import { effectiveScale } from "../../core/print/printerProfile";
import { scaleSheetContent } from "../../core/print/scaleSheet";
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
  /**
   * Printer calibration factor (S-D2.1). Applied to the page CONTENT about the
   * page centre, never to the page size: the paper is still A4, it is the
   * driver's scaling that is being cancelled out.
   */
  scale?: number;
  /**
   * Optional per-sheet slug strip (A8). One string per sheet, in the same order,
   * plus a printed rule of `ruleMm` so a scaling driver is caught on paper.
   * Composed by the caller from core/print/slug — this file only draws it.
   */
  slug?: { texts: string[]; ruleMm: number };
  /**
   * Pin the document dates so the same job produces byte-identical output (F4).
   *
   * Used by the CLI and by the regression test that byte-diffs against a
   * fixture: without it every build differs in its timestamps and a real change
   * would be invisible among them.
   */
  deterministic?: boolean;
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
  const scale = effectiveScale(opts.scale);
  const doc = await PDFDocument.create();
  doc.setTitle(opts.title ?? "Place cards");
  doc.setProducer("Plaque");
  doc.setCreator("Plaque");
  if (opts.deterministic) {
    // The epoch, not "now": two builds of one job must differ only where the
    // job differs.
    const fixed = new Date(0);
    doc.setCreationDate(fixed);
    doc.setModificationDate(fixed);
  }

  // Only the faces actually drawn. Embedding every loaded font put six
  // subsetted faces into a document that used one.
  const used = fontIdsUsedBy(opts.sheets);
  const needed = [...opts.fonts.values()].filter((font) => used.has(font.id));
  const { fonts: embedded, notSubset } = await embedFonts(doc, needed);
  const images = await embedImages(doc, opts.sheets);
  // A standard face: carries no bytes into the file, and stays legible even when
  // a font problem is what the slug is there to report.
  const slugFont = opts.slug ? await doc.embedFont(StandardFonts.Helvetica) : null;

  for (const unscaled of opts.sheets) {
    // Printer calibration is a pure transform of the imposed sheet — see
    // core/print/scaleSheet. Nothing below knows it happened.
    const sheet = scaleSheetContent(unscaled, scale);
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

    // The slug is drawn from the UNSCALED page, and so is exempt from the
    // calibration on purpose. Its rule is the probe for the printer driver's
    // scaling: printed at true size, a rule that does not measure 100mm on
    // paper convicts the driver. Scaling it would also push a strip 6mm from
    // the edge clean off the sheet at a few percent of correction.
    if (opts.slug) {
      drawSlug(page, sheet, opts.slug.texts[sheet.index] ?? "", opts.slug.ruleMm, slugFont, toPdf);
    }
  }

  const bytes = await doc.save();
  return { bytes, pageCount: opts.sheets.length, notSubset };
}

/** Slug height from the bottom edge; the strip sits inside it. */
const SLUG_INSET_MM = 6;
const SLUG_TEXT_PT = 5.5;

/**
 * The strip along the foot of the sheet: one line of provenance and a printed
 * rule. It is drawn inside the calibrated content, on purpose — measuring the
 * rule on paper then tests the FINAL output, correction included, which is the
 * only thing worth testing.
 */
function drawSlug(
  page: PDFPage,
  sheet: Sheet,
  text: string,
  ruleMm: Mm,
  font: import("pdf-lib").PDFFont | null,
  toPdf: (p: Point) => { x: number; y: number },
): void {
  if (!font) return;
  const ink = rgb(0.4, 0.4, 0.4);
  const baseline = toPdf({ x: SLUG_INSET_MM, y: sheet.pageHeightMm - SLUG_INSET_MM });
  page.drawText(text, { x: baseline.x, y: baseline.y, size: SLUG_TEXT_PT, font, color: ink });

  // The rule sits above the text, clear of the paper edge. If it does not
  // measure ruleMm on the paper, the driver scaled the page — see the note at
  // the call site for why this is drawn outside the calibration transform.
  const ruleY = sheet.pageHeightMm - SLUG_INSET_MM - 2.5;
  const width = Math.min(ruleMm, sheet.pageWidthMm - SLUG_INSET_MM * 2);
  drawSegment(
    page,
    [
      { x: SLUG_INSET_MM, y: ruleY },
      { x: SLUG_INSET_MM + width, y: ruleY },
    ],
    HAIRLINE_PT,
    ink,
    null,
    toPdf,
  );
  for (let mm = 0; mm <= width; mm += 10) {
    drawSegment(
      page,
      [
        { x: SLUG_INSET_MM + mm, y: ruleY },
        { x: SLUG_INSET_MM + mm, y: ruleY - (mm % 50 === 0 ? 2 : 1) },
      ],
      HAIRLINE_PT,
      ink,
      null,
      toPdf,
    );
  }
  const labelAt = toPdf({ x: SLUG_INSET_MM + width + 2, y: ruleY });
  page.drawText(`${width}mm reference — measure it`, {
    x: labelAt.x,
    y: labelAt.y,
    size: SLUG_TEXT_PT,
    font,
    color: ink,
  });
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
        ...(el.optical ? { optical: el.optical } : {}),
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

/** Font ids referenced by a text element that actually has something to draw. */
function fontIdsUsedBy(sheets: Sheet[]): Set<string> {
  const used = new Set<string>();
  for (const sheet of sheets) {
    for (const card of sheet.cards) {
      for (const el of card.scene.elements) {
        if (el.kind === "text" && el.lines.length > 0) used.add(el.fontId);
      }
    }
  }
  return used;
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
