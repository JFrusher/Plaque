import type { Mm, Orientation, PageSizeName, Pt, Size } from "./types";

/** 1 inch = 25.4mm = 72 PostScript points. */
const PT_PER_MM = 72 / 25.4;

export function mmToPt(mm: Mm): Pt {
  return mm * PT_PER_MM;
}

export function ptToMm(pt: Pt): Mm {
  return pt / PT_PER_MM;
}

/** Portrait dimensions. Landscape is the swap, done by `pageSizeMm`. */
export const PAGE_SIZES_MM: Record<PageSizeName, Size> = {
  A4: { w: 210, h: 297 },
  LETTER: { w: 215.9, h: 279.4 },
};

export const PAGE_LABELS: Record<PageSizeName, string> = {
  A4: "A4 (210 × 297mm)",
  LETTER: "US Letter (8.5 × 11in)",
};

export function pageSizeMm(page: PageSizeName, orientation: Orientation): Size {
  const portrait = PAGE_SIZES_MM[page];
  return orientation === "portrait" ? { ...portrait } : { w: portrait.h, h: portrait.w };
}

/** Rounds to 0.01mm. Guards float dust from accumulating through transforms. */
export function roundMm(mm: Mm): Mm {
  return Math.round(mm * 100) / 100;
}
