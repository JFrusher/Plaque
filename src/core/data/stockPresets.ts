import raw from "../../data/stock-presets.json";
import type { CardSpec, Orientation, PageSizeName, SheetSpec } from "../types";
import { pageSizeMm } from "../units";

/**
 * Pre-cut stock — Avery-style label sheets, badge inserts, perforated card.
 *
 * Pure data (discovery §5, extension point 1): adding a sheet is adding an entry
 * to `src/data/stock-presets.json`, with no code to touch. A preset states the
 * GRID — size, columns, rows, gaps — and the margins are derived from it here,
 * so a contributed preset can be checked with arithmetic rather than trusted.
 *
 * Crop marks and cut lines are suppressed when one is applied: the cutting
 * already happened at the factory, and marks would print onto the labels.
 */
export interface StockPreset {
  id: string;
  name: string;
  page: PageSizeName;
  orientation: Orientation;
  widthMm: number;
  heightMm: number;
  columns: number;
  rows: number;
  gapXMm: number;
  gapYMm: number;
}

export interface StockApplication {
  card: Pick<CardSpec, "widthMm" | "heightMm" | "bleedMm">;
  sheet: Pick<
    SheetSpec,
    | "page"
    | "orientation"
    | "marginTopMm"
    | "marginRightMm"
    | "marginBottomMm"
    | "marginLeftMm"
    | "gapXMm"
    | "gapYMm"
    | "cardRotationDeg"
    | "cropMarks"
    | "cutLines"
  >;
}

/**
 * Margins are whatever the grid leaves over, split evenly. That is how these
 * sheets are actually made, and it means a preset cannot quietly disagree with
 * itself: if the grid does not fit the page, `validatePreset` says so.
 */
export function applyPreset(preset: StockPreset): StockApplication {
  const page = pageSizeMm(preset.page, preset.orientation);
  const usedW = preset.columns * preset.widthMm + (preset.columns - 1) * preset.gapXMm;
  const usedH = preset.rows * preset.heightMm + (preset.rows - 1) * preset.gapYMm;
  const marginX = round((page.w - usedW) / 2);
  const marginY = round((page.h - usedH) / 2);

  return {
    // Bleed is meaningless on pre-cut stock: there is nothing left to trim.
    card: { widthMm: preset.widthMm, heightMm: preset.heightMm, bleedMm: 0 },
    sheet: {
      page: preset.page,
      orientation: preset.orientation,
      marginTopMm: marginY,
      marginBottomMm: marginY,
      marginLeftMm: marginX,
      marginRightMm: marginX,
      gapXMm: preset.gapXMm,
      gapYMm: preset.gapYMm,
      cardRotationDeg: 0,
      cropMarks: false,
      cutLines: false,
    },
  };
}

/** Returns the offending field, or null. Names the file so a bad entry is findable. */
export function validatePreset(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return "not an object";
  const p = value as Record<string, unknown>;
  for (const key of ["id", "name"]) {
    if (typeof p[key] !== "string" || !p[key]) return key;
  }
  if (p["page"] !== "A4" && p["page"] !== "LETTER") return "page";
  if (p["orientation"] !== "portrait" && p["orientation"] !== "landscape") return "orientation";
  for (const key of ["widthMm", "heightMm", "gapXMm", "gapYMm"]) {
    const n = p[key];
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return key;
  }
  for (const key of ["columns", "rows"]) {
    const n = p[key];
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1) return key;
  }

  // The grid has to fit the paper, or the preset would silently push labels off
  // the sheet — the exact failure pre-cut stock cannot recover from.
  const preset = value as StockPreset;
  const page = pageSizeMm(preset.page, preset.orientation);
  const usedW = preset.columns * preset.widthMm + (preset.columns - 1) * preset.gapXMm;
  const usedH = preset.rows * preset.heightMm + (preset.rows - 1) * preset.gapYMm;
  if (usedW > page.w) return "columns";
  if (usedH > page.h) return "rows";
  return null;
}

/** Every valid preset in the data file. A malformed one is dropped, loudly. */
export const STOCK_PRESETS: StockPreset[] = (raw.presets as unknown[]).filter((entry, index) => {
  const bad = validatePreset(entry);
  if (bad) {
    console.error(`stock-presets.json: preset ${index} has an invalid "${bad}" — ignoring it.`);
    return false;
  }
  return true;
}) as StockPreset[];

function round(mm: number): number {
  return Math.round(mm * 100) / 100;
}
