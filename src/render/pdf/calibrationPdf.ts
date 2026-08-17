import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { REFERENCE_RULE_MM } from "../../core/print/printerProfile";
import type { Mm, Orientation, PageSizeName } from "../../core/types";
import { mmToPt, pageSizeMm } from "../../core/units";

export interface CalibrationPdfOptions {
  page: PageSizeName;
  orientation: Orientation;
  printerName?: string;
}

/**
 * The measure-it-yourself page (S-D2.1).
 *
 * Deliberately NOT scaled by any printer profile — this sheet is how the factor
 * is discovered in the first place, so applying one would make the measurement
 * circular. It also carries its own instructions, because a printed page that
 * turns up in a drawer six months later has to explain itself.
 *
 * Uses a standard PDF font rather than a bundled face: it must be readable even
 * if font loading is what is broken, and it embeds nothing.
 */
export async function calibrationPdf(opts: CalibrationPdfOptions): Promise<Uint8Array> {
  const size = pageSizeMm(opts.page, opts.orientation);
  const doc = await PDFDocument.create();
  doc.setTitle("Plaque printer calibration");
  doc.setProducer("Plaque");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([mmToPt(size.w), mmToPt(size.h)]);
  const ink = rgb(0, 0, 0);

  // Same top-left convention as the rest of Plaque; flipped once, here.
  const y = (mm: Mm) => mmToPt(size.h - mm);
  const x = (mm: Mm) => mmToPt(mm);

  const text = (value: string, atX: Mm, atY: Mm, sizePt = 10, useBold = false) =>
    page.drawText(value, {
      x: x(atX),
      y: y(atY),
      size: sizePt,
      font: useBold ? bold : font,
      color: ink,
    });

  const line = (x1: Mm, y1: Mm, x2: Mm, y2: Mm, widthPt = 0.5) =>
    page.drawLine({
      start: { x: x(x1), y: y(y1) },
      end: { x: x(x2), y: y(y2) },
      thickness: widthPt,
      color: ink,
    });

  const left = 20;
  text("Plaque printer calibration", left, 20, 16, true);
  text(
    "Print this at 100% — no 'fit to page', no 'shrink oversized pages'.",
    left,
    28,
  );
  text(
    `Then measure the two rules below with a steel rule and type what you read into Print Setup.`,
    left,
    34,
  );
  if (opts.printerName) text(`Printer: ${opts.printerName}`, left, 40);

  // Horizontal rule with a tick every 10mm and a taller tick every 50mm.
  const ruleY = 60;
  line(left, ruleY, left + REFERENCE_RULE_MM, ruleY, 0.7);
  for (let mm = 0; mm <= REFERENCE_RULE_MM; mm += 10) {
    const tall = mm % 50 === 0;
    line(left + mm, ruleY, left + mm, ruleY - (tall ? 6 : 3), 0.5);
    if (tall) text(`${mm}`, left + mm - 2, ruleY - 8, 8);
  }
  text(`${REFERENCE_RULE_MM}mm across — measure end tick to end tick`, left, ruleY + 6, 10, true);

  // Vertical rule. Both axes matter: some drivers scale one axis only.
  const colX = left;
  const vTop = 90;
  line(colX, vTop, colX, vTop + REFERENCE_RULE_MM, 0.7);
  for (let mm = 0; mm <= REFERENCE_RULE_MM; mm += 10) {
    const tall = mm % 50 === 0;
    line(colX, vTop + mm, colX + (tall ? 6 : 3), vTop + mm, 0.5);
    if (tall) text(`${mm}`, colX + 8, vTop + mm + 1.5, 8);
  }
  text(`${REFERENCE_RULE_MM}mm down`, colX + 16, vTop + 6, 10, true);

  // A square proves the two axes agree, which a single rule cannot.
  const boxX = left + 60;
  const boxY = 100;
  const boxSize = 50;
  page.drawRectangle({
    x: x(boxX),
    y: y(boxY + boxSize),
    width: mmToPt(boxSize),
    height: mmToPt(boxSize),
    borderColor: ink,
    borderWidth: 0.7,
  });
  text(`${boxSize} × ${boxSize}mm square`, boxX, boxY + boxSize + 6);

  // Corner marks 10mm in, so a clipped margin is visible on the paper.
  for (const [cx, cy] of [
    [10, 10],
    [size.w - 10, 10],
    [10, size.h - 10],
    [size.w - 10, size.h - 10],
  ] as const) {
    line(cx - 5, cy, cx + 5, cy, 0.5);
    line(cx, cy - 5, cx, cy + 5, 0.5);
  }
  text(
    "The four crosses sit 10mm from each paper edge. If one is missing, that edge is inside the printer's unprintable margin.",
    left,
    size.h - 20,
    9,
  );

  return doc.save();
}
