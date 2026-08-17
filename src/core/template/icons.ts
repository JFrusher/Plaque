import type { IconRule } from "../types";
import type { GuestRow } from "../csv/parse";

function key(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Picks the icon for a cell value. Matching is exact once trimmed and
 * lower-cased — deliberately not fuzzy, because "Nut-Free" and "Not Free" are
 * one typo apart and guessing wrong feeds someone the wrong meal.
 */
export function resolveIconId(
  value: string,
  rules: IconRule[],
  fallbackIconId: string | null,
): string | null {
  const wanted = key(value);
  if (!wanted) return fallbackIconId;
  for (const rule of rules) {
    if (key(rule.match) === wanted) return rule.iconId;
  }
  return fallbackIconId;
}

export function resolveIconForRow(
  row: GuestRow,
  sourceField: string,
  rules: IconRule[],
  fallbackIconId: string | null,
): string | null {
  return resolveIconId(row[sourceField] ?? "", rules, fallbackIconId);
}

/** Distinct values in a column, for building rules without typing them by hand. */
export function distinctValues(rows: GuestRow[], field: string): string[] {
  const seen = new Map<string, string>();
  for (const row of rows) {
    const raw = (row[field] ?? "").trim();
    if (!raw) continue;
    const k = key(raw);
    if (!seen.has(k)) seen.set(k, raw);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/** Column values with no rule and no fallback — these guests get no icon. */
export function unmappedValues(
  rows: GuestRow[],
  field: string,
  rules: IconRule[],
  fallbackIconId: string | null,
): string[] {
  if (fallbackIconId !== null) return [];
  return distinctValues(rows, field).filter(
    (value) => resolveIconId(value, rules, null) === null,
  );
}
