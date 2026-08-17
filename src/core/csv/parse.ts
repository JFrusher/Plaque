import Papa from "papaparse";

/** One guest, keyed by CSV header. Values are trimmed strings — never undefined. */
export type GuestRow = Record<string, string>;

export interface CsvIssue {
  /** 1-based data row, or null for a problem with the file as a whole. */
  row: number | null;
  message: string;
}

export interface ParsedCsv {
  headers: string[];
  rows: GuestRow[];
  issues: CsvIssue[];
}

/**
 * Parses a guest CSV.
 *
 * Deliberately forgiving: a wedding guest list is exported from a spreadsheet by
 * someone who is not thinking about data hygiene. Ragged rows are reported and
 * kept, not dropped — losing a guest silently is the worst failure this app has.
 *
 * Papaparse runs in array mode rather than `header: true`, because its
 * `transformHeader` hook fires more than once per parse and any deduplication
 * state kept across those calls comes out wrong. Doing the header pass here also
 * makes surplus fields visible instead of hiding them in `__parsed_extra`.
 */
export function parseCsv(text: string): ParsedCsv {
  // Papaparse does not strip a UTF-8 BOM from string input, and a BOM welded to
  // the first header makes every lookup of that column miss.
  const clean = text.replace(/^﻿/, "");

  const issues: CsvIssue[] = [];
  const result = Papa.parse<string[]>(clean, { skipEmptyLines: "greedy" });

  for (const err of result.errors) {
    // Field-count and delimiter complaints are re-reported below in plainer words.
    if (err.code === "TooManyFields" || err.code === "TooFewFields") continue;
    if (err.code === "UndetectableDelimiter") continue;
    issues.push({ row: typeof err.row === "number" ? err.row : null, message: err.message });
  }

  const [headerRow, ...dataRows] = result.data;
  if (!headerRow || headerRow.every((h) => h.trim() === "")) {
    issues.push({ row: null, message: "No columns found. Is this a CSV file?" });
    return { headers: [], rows: [], issues };
  }

  const headers = dedupeHeaders(headerRow);

  if (headers.length === 1) {
    issues.push({
      row: null,
      message: `Only one column was found ("${headers[0]}"). Commas, semicolons and tabs are detected automatically — if your file uses something else, re-export it as comma-separated.`,
    });
  }

  const rows: GuestRow[] = [];
  for (const [i, values] of dataRows.entries()) {
    const rowNumber = i + 1;
    const row: GuestRow = {};
    headers.forEach((h, col) => {
      row[h] = (values[col] ?? "").trim();
    });

    if (values.length > headers.length) {
      issues.push({
        row: rowNumber,
        message: `Row ${rowNumber} has more values than there are columns. The extras were ignored.`,
      });
    } else if (values.length < headers.length) {
      const missing = headers.slice(values.length);
      issues.push({
        row: rowNumber,
        message: `Row ${rowNumber} is missing ${missing.length === 1 ? "a value" : "values"} for ${missing.join(", ")}. Blank cells were used.`,
      });
    }

    rows.push(row);
  }

  return { headers, rows, issues };
}

/**
 * Blank headers get a positional name and repeats get a suffix, so every column
 * stays addressable as a `{{token}}`. Spreadsheet exports produce both.
 */
function dedupeHeaders(raw: string[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((header, index) => {
    const base = header.replace(/^﻿/, "").trim() || `Column ${index + 1}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base} (${n + 1})`;
  });
}
