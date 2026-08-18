import type { FlipEdge } from "../imposition/duplex";
import type { Mm } from "../types";

/**
 * What Plaque knows about one physical printer.
 *
 * The only genuinely device-local entity in the app: it belongs to the machine
 * and the printer, not to the project, so it is never written into a
 * `.plaque.json`. Discovery §5.
 *
 * It exists for one reason. A consumer printer driver that quietly "fits to
 * page" turns 85mm cards into 82mm cards, and the user finds out after cutting
 * forty sheets (S-D2.1).
 */
export interface PrinterProfile {
  id: string;
  name: string;
  /**
   * Multiply every millimetre by this on export. 1 means the printer is honest.
   * 1.01 means it printed 1% small and the content is enlarged to compensate.
   */
  scale: number;
  /** What the user measured for the reference rule, kept so the maths is auditable. */
  measuredMm: Mm | null;
  calibratedAt: string | null;
  /**
   * Which edge this printer flips the sheet about in duplex. Mechanical, so it
   * belongs to the printer and is asked once (S-D2.2). Absent means long edge,
   * which is what almost every duplex unit does.
   */
  flipEdge?: FlipEdge;
  /**
   * Border this printer physically cannot reach, if the user has measured it
   * from the calibration page's corner crosses. Overrides the advisory default
   * on SheetSpec when present.
   */
  unprintableMarginMm?: Mm | null;
  /**
   * Correction applied to every back-side page, in millimetres right and down.
   * Measured once from the duplex test sheet: no consumer duplex unit registers
   * the second side perfectly, and a 2mm drift ruins a whole run of backs.
   */
  backOffsetXMm?: Mm;
  backOffsetYMm?: Mm;
}

/** Correction to apply to a back-side sheet, defaulting to none. */
export function backCorrection(profile: PrinterProfile | null | undefined): { dx: Mm; dy: Mm } {
  return {
    dx: finite(profile?.backOffsetXMm),
    dy: finite(profile?.backOffsetYMm),
  };
}

/**
 * The duplex test sheet's scales are laid out so the number the user reads off
 * them IS the correction, in back-page millimetres — no sign to work out and no
 * arithmetic to get wrong. This only clamps it to something sane.
 *
 * See render/pdf/duplexTestPdf for why the printed labels run the way they do.
 */
export function readingToCorrection(reading: number, existingMm: Mm = 0): Mm {
  if (!Number.isFinite(reading)) return finite(existingMm);
  const total = finite(existingMm) + reading;
  return Math.max(-MAX_BACK_OFFSET_MM, Math.min(MAX_BACK_OFFSET_MM, Math.round(total * 10) / 10));
}

/** Past this it is a paper-feed fault, not registration drift, and the scales run out. */
export const MAX_BACK_OFFSET_MM = 10;

/** How far either way the printed scales actually run. A reading past this is a misread. */
export const READABLE_SPAN_MM = MAX_BACK_OFFSET_MM / 2;

/** A difference this large between the two reading stations is skew, not offset. */
export const SKEW_THRESHOLD_MM = 1;

/** What the user reads off the back of the test sheet. Blank fields are 0. */
export interface DuplexReadings {
  aAcross: Mm;
  aDown: Mm;
  bAcross: Mm;
  bDown: Mm;
}

export interface DuplexCorrection {
  /** The new total to store, existing correction included. */
  dx: Mm;
  dy: Mm;
  /** How far the two stations disagree — translation cannot fix this part. */
  skewMm: Mm;
  skewed: boolean;
}

/**
 * Turns four readings into the correction to store.
 *
 * Two things matter here and both are easy to get wrong by hand.
 *
 * **The readings ADD to what is already stored.** The test sheet is printed
 * with the current correction already applied, so a retest measures what is
 * *left*, not the whole error. Replacing rather than adding throws away a good
 * correction the moment the user does the honest thing and retests.
 *
 * **Both stations get averaged.** A pure translation reads the same at A and B,
 * so their mean is the best estimate of it and their difference is skew — which
 * no amount of shifting can remove, so it is reported rather than absorbed.
 */
export function correctionFromReadings(
  readings: DuplexReadings,
  existing: { dx: Mm; dy: Mm },
): DuplexCorrection {
  const mean = (a: number, b: number) => (finite(a) + finite(b)) / 2;
  const spread = (a: number, b: number) => Math.abs(finite(a) - finite(b));
  const skewMm = Math.round(
    Math.max(spread(readings.aAcross, readings.bAcross), spread(readings.aDown, readings.bDown)) * 10,
  ) / 10;

  return {
    dx: readingToCorrection(mean(readings.aAcross, readings.bAcross), existing.dx),
    dy: readingToCorrection(mean(readings.aDown, readings.bDown), existing.dy),
    skewMm,
    skewed: skewMm > SKEW_THRESHOLD_MM,
  };
}

function finite(value: number | null | undefined): Mm {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** The rule printed on the calibration page. 100mm is easy to measure accurately. */
export const REFERENCE_RULE_MM = 100;

/**
 * Beyond this a "measurement" is a typo, not a printer. Real consumer drift is
 * well under 5%; 10mm entered for a 100mm rule would scale a card tenfold.
 */
const MAX_DRIFT = 0.1;

/** Below this the correction is smaller than anyone can cut to. Discovery: 0.5%. */
export const NOTABLE_DRIFT = 0.005;

export type ScaleResult =
  | { ok: true; scale: number }
  | { ok: false; reason: string };

/**
 * Turns "I measured 99.2mm" into the factor that makes the next print land at
 * true size. Printing small means scaling up, hence reference ÷ measured.
 */
export function scaleFromMeasurement(
  measuredMm: number,
  referenceMm: Mm = REFERENCE_RULE_MM,
): ScaleResult {
  if (!Number.isFinite(measuredMm) || measuredMm <= 0) {
    return { ok: false, reason: "Enter the length you measured, in millimetres." };
  }
  const scale = referenceMm / measuredMm;
  if (Math.abs(scale - 1) > MAX_DRIFT) {
    return {
      ok: false,
      reason: `${measuredMm}mm is more than 10% off the ${referenceMm}mm rule. Check you measured the printed rule, not the page edge.`,
    };
  }
  // 0.1% is finer than any home printer holds, and it keeps the stored number
  // readable in the slug line.
  return { ok: true, scale: Math.round(scale * 1000) / 1000 };
}

/** True when the correction is big enough to be worth telling the user about. */
export function isNotableDrift(scale: number): boolean {
  return Math.abs(scale - 1) > NOTABLE_DRIFT;
}

/** "1.2% larger" / "0.8% smaller" / "no correction". */
export function describeScale(scale: number): string {
  if (!isNotableDrift(scale)) return "no correction";
  const percent = Math.abs((scale - 1) * 100).toFixed(1);
  return `${percent}% ${scale > 1 ? "larger" : "smaller"}`;
}

/**
 * The factor to apply on export. Anything missing or unusable means 1 — an
 * export must never be silently distorted by a half-written profile.
 */
export function effectiveScale(scale: number | null | undefined): number {
  return typeof scale === "number" && Number.isFinite(scale) && scale > 0 ? scale : 1;
}
