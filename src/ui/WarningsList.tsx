import type { Artefact } from "../core/data/artefacts";
import type { Issue } from "../core/geometry/validate";
import type { GuestWarning } from "../core/imposition/paginate";
import styles from "./WarningsList.module.css";

export interface WarningsListProps {
  issues: Issue[];
  warnings: GuestWarning[];
  artefacts: Artefact[];
}

const MAX_NAMED = 8;

/**
 * Geometry problems and per-guest overflow, named.
 *
 * "Some names do not fit" is useless — the user needs to know WHICH guests, so
 * they can widen a box, allow two lines, or accept a smaller size for those few.
 */
export function WarningsList({ issues, warnings, artefacts }: WarningsListProps) {
  const overflowing = [
    ...new Set(warnings.filter((w) => w.kind === "overflow").map((w) => w.artefactIndex)),
  ];
  const missingFields = [...new Set(warnings.filter((w) => w.kind === "missing-field").map((w) => w.detail))];
  const missingIcons = [...new Set(warnings.filter((w) => w.kind === "missing-icon").map((w) => w.detail))];
  // Tofu on a printed card cannot be recovered, so these read as errors.
  const missingGlyphs = [
    ...new Set(warnings.filter((w) => w.kind === "missing-glyph").map((w) => w.detail)),
  ];
  const unknown = [...new Set(warnings.filter((w) => w.kind === "unknown-element").map((w) => w.detail))];

  if (
    issues.length === 0 &&
    overflowing.length === 0 &&
    missingFields.length === 0 &&
    missingIcons.length === 0 &&
    missingGlyphs.length === 0 &&
    unknown.length === 0
  ) {
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

      {missingGlyphs.slice(0, MAX_NAMED).map((detail) => (
        <li key={detail} className={styles.error}>
          {detail}
        </li>
      ))}
      {missingGlyphs.length > MAX_NAMED && (
        <li className={styles.error}>
          …and {missingGlyphs.length - MAX_NAMED} more rows with characters this font cannot print.
        </li>
      )}

      {unknown.map((detail) => (
        <li key={detail} className={styles.error}>
          {detail}
        </li>
      ))}

      {overflowing.length > 0 && (
        <li className={styles.warning}>
          {overflowing.length} {overflowing.length === 1 ? "does" : "do"} not fit even at the
          smallest size allowed: {nameList(overflowing, artefacts)}
        </li>
      )}
    </ul>
  );
}

/** Artefacts already know what to call themselves — a guest, a table, the run-sheet. */
function nameList(indexes: number[], artefacts: Artefact[]): string {
  const label = (index: number) => artefacts[index]?.label ?? `item ${index + 1}`;
  const named = indexes.slice(0, MAX_NAMED).map(label).join(", ");
  return indexes.length > MAX_NAMED ? `${named} and ${indexes.length - MAX_NAMED} more.` : `${named}.`;
}
