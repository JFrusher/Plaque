import type { GuestRow } from "../csv/parse";
import type { RowScope } from "../types";

/**
 * One thing that gets printed.
 *
 * The whole of Plaque used to assume one CSV row produced one card. That is true
 * of place cards and false of most other stationery: a table menu consumes every
 * row for one table, a kitchen run-sheet consumes the lot. Discovery §1.
 *
 * Everything downstream — pagination, imposition, both renderers — now works in
 * artefacts and no longer knows what a row is. That single indirection is what
 * lets one dataset produce place cards, table numbers, menus and run-sheets with
 * no new rendering code.
 */
export interface Artefact {
  /** Stable across rebuilds, so a selection survives an edit. */
  key: string;
  /**
   * The row that `{{Column}}` tokens resolve against. For a group it is the
   * first row in that group, which is what makes `{{Table}}` work on a table
   * number card without any special case.
   */
  row: GuestRow;
  /** Every row this artefact covers. A list element repeats over these. */
  rows: GuestRow[];
  /** Indices into the original dataset, for warnings and selection. */
  rowIndexes: number[];
  /**
   * Id of the row tokens bind to. Per-row overrides hang off this, so an
   * override follows its row through a re-group rather than being pinned to a
   * position in the file (D1).
   */
  rowId: string;
  /** Ids of every row covered, in order. */
  rowIds: string[];
  /** What the user sees in the pagination and in warnings. */
  label: string;
}

/** An artefact with no data at all — what the editor shows before a CSV lands. */
export const EMPTY_ROW: GuestRow = { "": "" };

/** Identity for a dataset that has none yet. Positional, and only a fallback. */
export function defaultRowIds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `r${i}`);
}

/**
 * ponytail: document scope produces exactly ONE artefact, so a list longer than
 * a single card cannot spill onto a second sheet — 150 rows will not fit an A4
 * page at any legible size, and the fitter reports the overflow rather than
 * hiding it. The upgrade path is spilling one artefact across several slots,
 * which is a change to `paginate`, not to this file. Until then, group a long
 * list (per table, per course) so each artefact is a page's worth.
 */
export function buildArtefacts(
  rows: GuestRow[],
  scope: RowScope,
  headers: string[] = [],
  ids: string[] = defaultRowIds(rows.length),
): Artefact[] {
  const idAt = (index: number) => ids[index] ?? `r${index}`;

  if (scope.kind === "document") {
    return rows.length === 0
      ? []
      : [
          {
            key: "document",
            row: rows[0] ?? EMPTY_ROW,
            rows,
            rowIndexes: rows.map((_, i) => i),
            rowId: idAt(0),
            rowIds: rows.map((_, i) => idAt(i)),
            label: `All ${rows.length} rows`,
          },
        ];
  }

  if (scope.kind === "per-group") {
    return groupBy(rows, scope.byColumn, idAt);
  }

  return rows.map((row, index) => ({
    key: `row:${idAt(index)}`,
    row,
    rows: [row],
    rowIndexes: [index],
    rowId: idAt(index),
    rowIds: [idAt(index)],
    label: rowLabel(row, headers),
  }));
}

/**
 * Groups in first-appearance order, not sorted: the CSV's own order is the one
 * the user recognises, and re-sorting silently would change which table prints
 * first.
 *
 * Matching is on the trimmed, case-folded value so "Table 1" and "table 1 " do
 * not split a table — but the ORIGINAL value is what gets printed, because
 * rewriting someone's data is never this function's job (S-I.2).
 */
function groupBy(
  rows: GuestRow[],
  column: string,
  idAt: (index: number) => string,
): Artefact[] {
  const groups = new Map<
    string,
    { label: string; rows: GuestRow[]; rowIndexes: number[]; rowIds: string[] }
  >();

  for (const [index, row] of rows.entries()) {
    const raw = row[column] ?? "";
    const key = normalise(raw);
    const existing = groups.get(key);
    if (existing) {
      existing.rows.push(row);
      existing.rowIndexes.push(index);
      existing.rowIds.push(idAt(index));
    } else {
      groups.set(key, {
        label: raw || "(blank)",
        rows: [row],
        rowIndexes: [index],
        rowIds: [idAt(index)],
      });
    }
  }

  return [...groups.entries()].map(([key, group]) => ({
    key: `group:${key}`,
    row: group.rows[0] ?? EMPTY_ROW,
    rows: group.rows,
    rowIndexes: group.rowIndexes,
    rowId: group.rowIds[0] ?? "",
    rowIds: group.rowIds,
    label: `${group.label} (${group.rows.length})`,
  }));
}

/** Case, surrounding space and unicode dashes are not real differences. */
export function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/[‐-―]/g, "-").replace(/\s+/g, " ");
}

/** The first couple of values, which is how a person recognises their own row. */
function rowLabel(row: GuestRow, headers: string[]): string {
  const keys = headers.length > 0 ? headers : Object.keys(row);
  const values = keys.map((h) => row[h]).filter((v): v is string => Boolean(v));
  return values.slice(0, 2).join(" ") || "(blank row)";
}
