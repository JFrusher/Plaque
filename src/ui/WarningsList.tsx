import type { Issue } from "../core/geometry/validate";
import type { GuestWarning } from "../core/imposition/paginate";
import type { GuestRow } from "../core/csv/parse";
import styles from "./WarningsList.module.css";

export interface WarningsListProps {
  issues: Issue[];
  warnings: GuestWarning[];
  rows: GuestRow[];
  headers: string[];
}

const MAX_NAMED = 8;

/**
 * Geometry problems and per-guest overflow, named.
 *
 * "Some names do not fit" is useless — the user needs to know WHICH guests, so
 * they can widen a box, allow two lines, or accept a smaller size for those few.
 */
export function WarningsList({ issues, warnings, rows, headers }: WarningsListProps) {
  const overflowing = [...new Set(warnings.filter((w) => w.kind === "overflow").map((w) => w.guestIndex))];
  const missingFields = [...new Set(warnings.filter((w) => w.kind === "missing-field").map((w) => w.detail))];
  const missingIcons = [...new Set(warnings.filter((w) => w.kind === "missing-icon").map((w) => w.detail))];

  if (issues.length === 0 && overflowing.length === 0 && missingFields.length === 0 && missingIcons.length === 0) {
    return null;
  }

  return (
    <ul className={styles.list}>
      {issues.map((issue) => (
        <li key={issue.id} className={issue.severity === "error" ? styles.error : styles.warning}>
          {issue.message}
        </li>
      ))}

      {missingFields.map((detail) => (
        <li key={detail} className={styles.warning}>
          {detail}
        </li>
      ))}

      {missingIcons.map((detail) => (
        <li key={detail} className={styles.warning}>
          {detail}
        </li>
      ))}

      {overflowing.length > 0 && (
        <li className={styles.warning}>
          {overflowing.length} {overflowing.length === 1 ? "name does" : "names do"} not fit even at
          the smallest size allowed: {nameList(overflowing, rows, headers)}
        </li>
      )}
    </ul>
  );
}

function nameList(indexes: number[], rows: GuestRow[], headers: string[]): string {
  const label = (index: number) => {
    const row = rows[index];
    if (!row) return `row ${index + 1}`;
    const values = headers.map((h) => row[h]).filter(Boolean);
    return values.slice(0, 2).join(" ") || `row ${index + 1}`;
  };
  const named = indexes.slice(0, MAX_NAMED).map(label).join(", ");
  return indexes.length > MAX_NAMED ? `${named} and ${indexes.length - MAX_NAMED} more.` : `${named}.`;
}
