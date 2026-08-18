import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { mirrorAxisFor, type FlipEdge } from "../../core/imposition/duplex";
import { READABLE_SPAN_MM, SKEW_THRESHOLD_MM } from "../../core/print/printerProfile";
import type { Mm, Orientation, PageSizeName, Point } from "../../core/types";
import { mmToPt, pageSizeMm, ptToMm } from "../../core/units";

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
 * **Is the flip edge right?** The front carries a single solid witness mark. The
 * back draws an empty box at the position that mark lands on for the chosen flip
 * edge. Mark inside box means the edge is right; one glance settles it.
 *
 * **How far out is the registration?** The front carries plain crosshairs at two
 * stations. The back carries numbered scales centred on where those crosshairs
 * should fall — four in all, named on the sheet exactly as they are named in the
 * app. Hold the sheet to a window, read where the front's line crosses each, and
 * type the numbers in; those numbers *are* the correction.
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
 *
 * A retest is printed with the stored correction already applied, so its scales
 * measure what is LEFT rather than the whole error. That is why the app adds a
 * reading to the stored correction instead of replacing it — see
 * core/print/printerProfile.correctionFromReadings.
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
  // The witness has to clear the instruction band AND the stations, which sit on
  // the A→B diagonal — and it has to clear them AFTER mirroring, which is what
  // makes the position depend on the axis being tested.
  const star: Point =
    axis === "x"
      ? { x: 30, y: size.h - 30 }
      : { x: size.w - 30, y: size.h / 2 - 25 };

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
     * Wrapped instruction text, returning the y it finished on.
     *
     * The sheet prints on A4 and Letter, portrait and landscape, so a line long
     * enough to say something useful runs off the narrow ones. Wrapping keeps
     * the wording free to be clear instead of short.
     */
    paragraph(
      value: string,
      at: Point,
      opts: { sizePt?: number; bold?: boolean } = {},
    ): Mm {
      const sizePt = opts.sizePt ?? 9;
      const face = opts.bold ? fonts.bold : fonts.font;
      const maxWidth = size.w - at.x - MARGIN_MM;
      const lines: string[] = [];
      let line = "";
      for (const word of value.split(" ")) {
        const candidate = line === "" ? word : `${line} ${word}`;
        if (line !== "" && ptToMm(face.widthOfTextAtSize(candidate, sizePt)) > maxWidth) {
          lines.push(line);
          line = word;
        } else {
          line = candidate;
        }
      }
      if (line !== "") lines.push(line);

      const leading = ptToMm(sizePt) * 1.4;
      for (const [i, text] of lines.entries()) {
        page.drawText(text, {
          x: X(at.x),
          y: Y(at.y + i * leading),
          size: sizePt,
          font: face,
          color: ink,
        });
      }
      return at.y + lines.length * leading;
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

/** Text margin, and the width the instruction band wraps to. */
const MARGIN_MM = 20;

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

  d.text("Plaque duplex test — FRONT", { x: MARGIN_MM, y: 15 }, 15, true);
  const y = d.paragraph(
    "Print both pages on ONE sheet, double-sided, at 100% — turn off 'fit to page'. Use plain paper: you need to see through it.",
    { x: MARGIN_MM, y: 23 },
  );
  d.paragraph(`Everything you read is on the BACK page. Testing the ${opts.flipEdge} edge flip.`, {
    x: MARGIN_MM,
    y: y + 2,
  }, { bold: true });

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

  d.text("Plaque duplex test — BACK", { x: MARGIN_MM, y: 15 }, 15, true);
  let y = d.paragraph("Hold the sheet up to a window and read it from THIS side.", {
    x: MARGIN_MM,
    y: 23,
  });
  y = d.paragraph(
    "1. Does the front's solid square sit inside the witness box below? If not, switch to the other flip edge and start again.",
    { x: MARGIN_MM, y: y + 2 },
  );
  y = d.paragraph(
    "2. Each station has two scales: 'across' and 'down'. Read where the front's line crosses each one and type all four numbers into Print setup — A across, A down, B across, B down.",
    { x: MARGIN_MM, y: y + 1 },
  );
  y = d.paragraph(
    `3. If A and B differ by more than ${SKEW_THRESHOLD_MM}mm the sheet went through skewed. No shift can fix that: feed the paper straight and print this again.`,
    { x: MARGIN_MM, y: y + 1 },
  );
  if (offset.dx !== 0 || offset.dy !== 0) {
    d.paragraph(
      `This sheet already carries a correction of ${offset.dx}mm across and ${offset.dy}mm down, so every scale should now read 0. Whatever is left over is what Plaque adds to it.`,
      { x: MARGIN_MM, y: y + 2 },
      { bold: true },
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
  const span = READABLE_SPAN_MM;
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
