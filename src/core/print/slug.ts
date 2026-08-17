import type { CardSpec, SheetSpec } from "../types";
import { REFERENCE_RULE_MM, isNotableDrift } from "./printerProfile";

/**
 * The optional strip along the bottom of each printed sheet.
 *
 * Its job is to make a bad print explain itself. Six months later, holding a
 * sheet that came out 3% small, the answer is printed on the paper: which sizes
 * were asked for, which correction was applied, and which build produced it.
 * Discovery §6.4.
 */
export interface SlugInput {
  card: CardSpec;
  sheet: SheetSpec;
  rowCount: number;
  /** Applied printer correction. 1 means none. */
  scale: number;
  buildHash: string;
  sheetIndex: number;
  sheetCount: number;
}

export const SLUG_RULE_MM = REFERENCE_RULE_MM;

export function slugText(input: SlugInput): string {
  const { card } = input;
  const parts = [
    `${trim(card.widthMm)}×${trim(card.heightMm)}mm`,
    card.bleedMm > 0 ? `bleed ${trim(card.bleedMm)}mm` : "no bleed",
  ];
  if (card.fold !== "none") {
    parts.push(`fold ${card.fold === "horizontal" ? "H" : "V"} @ ${trim(card.foldPositionMm)}mm`);
  }
  if (input.sheet.cardRotationDeg !== 0) parts.push(`rotated ${input.sheet.cardRotationDeg}°`);
  // Always stated, including when it is 1: "no correction" printed on the sheet
  // is the difference between a known-good print and an unexplained one.
  parts.push(
    isNotableDrift(input.scale) ? `scale ×${input.scale.toFixed(3)}` : "scale 1.000 (uncorrected)",
  );
  parts.push(`${input.rowCount} ${input.rowCount === 1 ? "card" : "cards"}`);
  parts.push(`sheet ${input.sheetIndex + 1}/${input.sheetCount}`);
  parts.push(`build ${input.buildHash}`);
  return `Plaque · ${parts.join(" · ")}`;
}

/**
 * A short, stable fingerprint of whatever went into a build.
 *
 * FNV-1a, 32-bit: deterministic, synchronous and eight characters long. It
 * answers "is this the same PDF I printed last week?" — it is not a security
 * hash and does not need to be.
 */
export function buildHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // Multiply by the FNV prime in 32-bit space without overflowing to float.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Everything that changes the printed result, and nothing that does not. */
export function buildFingerprint(input: {
  card: CardSpec;
  sheet: SheetSpec;
  template: unknown;
  rowCount: number;
  scale: number;
}): string {
  return buildHash(JSON.stringify(input));
}

function trim(mm: number): string {
  return String(Math.round(mm * 10) / 10);
}
