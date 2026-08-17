import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { mirrorAxisFor, type FlipEdge } from "../../core/imposition/duplex";
import { MAX_BACK_OFFSET_MM } from "../../core/print/printerProfile";
import type { Mm, Orientation, PageSizeName, Point } from "../../core/types";
import { mmToPt, pageSizeMm } from "../../core/units";

export interface DuplexTestOptions {
  page: PageSizeName;
  orientation: Orientation;
  /** The choice being tested. Page two is mirrored exactly as a real back sheet is. */
  flipEdge: FlipEdge;
  /** Corrections already stored, so a re-test proves they worked. */
  backOffsetXMm?: Mm;
  backOffsetYMm?: Mm;
}

/**
 * Two pages that answer both duplex questions in one print (B3).
 *
 * **Is the flip edge right?** The front carries a single ★ near one corner. The
 * back says, at the position that same corner lands on for the chosen flip edge,
 * that the ★ should be behind it. One glance settles it.
 *
 * **How far out is the registration?** The front carries plain crosshairs at two
 * stations. The back carries numbered scales centred on where those crosshairs
 * should fall. Hold the sheet to a window, read the number the front's line
 * crosses, and type it in — that number *is* the correction.
 *
 * ### Why the numbers read the way they do
 *
 * The user reads from the back, with the front's lines showing through. If the
 * printer lays the second side 1.5mm to the right (in back-page coordinates),
 * the back's scale sits 1.5mm right of the front's line, so the line falls at
 * −1.5 on a scale numbered left-to-right. Shifting the back content by −1.5mm is
 * exactly the correction needed. So the value read is the value to store, with
 * no sign to reason about — which is the whole point, because a sign error here
 * doubles the misalignment instead of removing it.
 *
 * Two stations, not one, so skew is visible: a translation cannot fix a sheet
 * that went through crooked, and the sheet says so.
 */
export async function duplexTestPdf(opts: DuplexTestOptions): Promise<Uint8Array> {
  const size = pageSizeMm(opts.page, opts.orientation);
  const axis = mirrorAxisFor(opts.flipEdge, size.w, size.h);
  const dx = opts.backOffsetXMm ?? 0;
  const dy = opts.backOffsetYMm ?? 0;

  const doc = await PDFDocument.create();
  doc.setTitle("Plaque duplex test");
  doc.setProducer("Plaque");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  // Stations sit well inside the unprintable border, and far apart, so the pair
  // of readings also reveals skew.
  const stations: { label: string; at: Point }[] = [
    { label: "A", at: { x: 55, y: 70 } },
    { label: "B", at: { x: size.w - 55, y: size.h - 70 } },
  ];
  const star = { x: 25, y: 25 };

  const mirror = (p: Point): Point =>
    axis === "x" ? { x: size.w - p.x, y: p.y } : { x: p.x, y: size.h - p.y };

  drawFront(doc, size, { font, bold }, stations, star, opts);
  drawBack(doc, size, { font, bold }, stations, star, mirror, { dx, dy });

  return doc.save();
}

interface Fonts {
  font: PDFFont;
  bold: PDFFont;
}

function pageHelpers(page: PDFPage, size: { w: Mm; h: Mm }, fonts: Fonts) {
  const ink = rgb(0, 0, 0);
  const grey = rgb(0.45, 0.45, 0.45);
  // Same top-left convention as the rest of Plaque; flipped once, here.
  const X = (mm: Mm) => mmToPt(mm);
  const Y = (mm: Mm) => mmToPt(size.h - mm);

  return {
    ink,
    grey,
    text(value: string, at: Point, sizePt = 9, useBold = false, color = ink) {
      page.drawText(value, {
        x: X(at.x),
        y: Y(at.y),
        size: sizePt,
        font: useBold ? fonts.bold : fonts.font,
        color,
      });
    },
    line(from: Point, to: Point, widthPt = 0.5, color = ink) {
      page.drawLine({
        start: { x: X(from.x), y: Y(from.y) },
        end: { x: X(to.x), y: Y(to.y) },
        thickness: widthPt,
        color,
      });
    },
    box(at: Point, w: Mm, h: Mm, widthPt = 0.7, color = ink) {
      page.drawRectangle({
        x: X(at.x),
        y: Y(at.y + h),
        width: mmToPt(w),
        height: mmToPt(h),
        borderColor: color,
        borderWidth: widthPt,
      });
    },
    /**
     * Drawn, not typed. The standard PDF fonts are WinAnsi and cannot encode a
     * star or an arrow, and a test sheet is the wrong place to discover that.
     */
    fill(at: Point, w: Mm, h: Mm, color = ink) {
      page.drawRectangle({
        x: X(at.x),
        y: Y(at.y + h),
        width: mmToPt(w),
        height: mmToPt(h),
        color,
      });
    },
  };
}

const CROSSHAIR_MM = 30;

function drawFront(
  doc: PDFDocument,
  size: { w: Mm; h: Mm },
  fonts: Fonts,
  stations: { label: string; at: Point }[],
  star: Point,
  opts: DuplexTestOptions,
): void {
  const page = doc.addPage([mmToPt(size.w), mmToPt(size.h)]);
  const d = pageHelpers(page, size, fonts);

  d.text("Plaque duplex test — FRONT", { x: 20, y: 15 }, 15, true);
  d.text("Print both pages on ONE sheet, duplex, at 100% — no 'fit to page'.", { x: 20, y: 22 });
  d.text("Plain paper: you need to see through it. Then read the BACK page.", { x: 20, y: 27 });
  d.text(`Testing flip edge: ${opts.flipEdge} edge.`, { x: 20, y: 32 }, 9, true);

  // The flip-edge witness. One mark, one question.
  d.fill({ x: star.x - 3, y: star.y - 3 }, 6, 6);
  d.text("witness mark", { x: star.x + 5, y: star.y + 1 }, 8);

  // Long, thin crosshairs: only their POSITION matters through the paper, so
  // there is nothing to read backwards.
  for (const station of stations) {
    const { at, label } = station;
    d.line({ x: at.x, y: at.y - CROSSHAIR_MM / 2 }, { x: at.x, y: at.y + CROSSHAIR_MM / 2 }, 0.4);
    d.line({ x: at.x - CROSSHAIR_MM / 2, y: at.y }, { x: at.x + CROSSHAIR_MM / 2, y: at.y }, 0.4);
    d.text(label, { x: at.x + 2, y: at.y - 2 }, 11, true);
    d.text(`station ${label}`, { x: at.x + 2, y: at.y + 5 }, 7, false, d.grey);
  }
}

function drawBack(
  doc: PDFDocument,
  size: { w: Mm; h: Mm },
  fonts: Fonts,
  stations: { label: string; at: Point }[],
  star: Point,
  mirror: (p: Point) => Point,
  offset: { dx: Mm; dy: Mm },
): void {
  const page = doc.addPage([mmToPt(size.w), mmToPt(size.h)]);
  const d = pageHelpers(page, size, fonts);
  const shift = (p: Point): Point => ({ x: p.x + offset.dx, y: p.y + offset.dy });

  d.text("Plaque duplex test — BACK", { x: 20, y: 15 }, 15, true);
  d.text("Hold the sheet up to a window and read from THIS side.", { x: 20, y: 22 });
  d.text(
    "At each station, read the number the front's line crosses. Type those two numbers into Print setup.",
    { x: 20, y: 27 },
  );
  d.text(
    `If A and B disagree by more than 1mm the sheet went through skewed — feed it straight and retest.`,
    { x: 20, y: 32 },
  );
  d.text(
    "The front's witness mark should be behind this page's witness box. If it is not, choose the other flip edge.",
    { x: 20, y: 42 },
    9,
    true,
  );
  if (offset.dx !== 0 || offset.dy !== 0) {
    d.text(
      `Already correcting by ${offset.dx}mm right, ${offset.dy}mm down — both scales should now read 0.`,
      { x: 20, y: 37 },
      9,
      true,
    );
  }

  // The flip witness, at the position the front's ★ lands on for this flip edge.
  const witness = shift(mirror(star));
  d.box({ x: witness.x - 6, y: witness.y - 6 }, 12, 12);
  // The label sits on whichever side of the box has room; a mark near the right
  // edge of the page would otherwise run its caption off the paper.
  const captionOnRight = witness.x < size.w / 2;
  d.text(
    "witness box",
    { x: captionOnRight ? witness.x + 8 : witness.x - 30, y: witness.y + 1 },
    8,
    true,
  );

  for (const station of stations) {
    const at = shift(mirror(station.at));
    drawScale(d, at, "x", station.label);
    drawScale(d, at, "y", station.label);
  }
}

/**
 * A numbered scale centred on where the front's crosshair should fall. Labelled
 * every whole millimetre, ticked every half, and numbered in the natural reading
 * direction of this page — see the sign note on `duplexTestPdf`.
 */
function drawScale(
  d: ReturnType<typeof pageHelpers>,
  centre: Point,
  axis: "x" | "y",
  label: string,
): void {
  const span = MAX_BACK_OFFSET_MM / 2;
  const horizontal = axis === "x";
  const along = (mm: Mm): Point =>
    horizontal ? { x: centre.x + mm, y: centre.y } : { x: centre.x, y: centre.y + mm };

  // The baseline is offset from the crosshair centre so the two scales do not
  // sit on top of each other.
  const shiftAcross = horizontal ? { x: 0, y: 9 } : { x: 9, y: 0 };
  const base = (mm: Mm): Point => {
    const p = along(mm);
    return { x: p.x + shiftAcross.x, y: p.y + shiftAcross.y };
  };

  d.line(base(-span), base(span), 0.4);
  for (let mm = -span; mm <= span; mm += 0.5) {
    const whole = Number.isInteger(mm);
    const tick = whole ? 2.5 : 1.2;
    const from = base(mm);
    const to = horizontal ? { x: from.x, y: from.y - tick } : { x: from.x - tick, y: from.y };
    d.line(from, to, mm === 0 ? 0.7 : 0.3);
    if (whole && mm !== 0) {
      const at = horizontal ? { x: from.x - 1.2, y: from.y + 3 } : { x: from.x + 1.5, y: from.y + 1 };
      d.text(String(mm), at, 6);
    }
  }
  const zeroAt = base(0);
  d.text(
    horizontal ? `${label} across` : `${label} down`,
    horizontal ? { x: zeroAt.x - 2, y: zeroAt.y + 6 } : { x: zeroAt.x + 4, y: zeroAt.y - 4 },
    7,
    true,
  );
}
