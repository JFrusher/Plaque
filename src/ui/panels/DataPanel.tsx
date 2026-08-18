import { useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { parseCsv } from "../../core/csv/parse";
import { buildArtefacts } from "../../core/data/artefacts";
import type { RowScope } from "../../core/types";
import { usePlaque } from "../../state/store";
import { Hint, SelectField, SubGroup } from "../controls";
import styles from "./DataPanel.module.css";

const PER_ROW: RowScope = { kind: "per-row" };

function scopeValue(scope: RowScope): string {
  if (scope.kind === "per-group") return `group:${scope.byColumn}`;
  return scope.kind;
}

function parseScope(value: string): RowScope {
  if (value === "document") return { kind: "document" };
  if (value.startsWith("group:")) return { kind: "per-group", byColumn: value.slice(6) };
  return PER_ROW;
}

/** States the consequence in counts, because that is what the user is deciding. */
function scopeHint(scope: RowScope, rowCount: number, artefactCount: number): string {
  if (scope.kind === "per-row") return `${rowCount} rows, ${artefactCount} cards.`;
  if (scope.kind === "document") return `${rowCount} rows on one document.`;
  return `${rowCount} rows fall into ${artefactCount} groups by "${scope.byColumn}" — one artefact each.`;
}

/** FR-STA-01. Drag-and-drop or pick a CSV; every column becomes a bindable token. */
export function DataPanel() {
  const { headers, rows, csvIssues, fileName, setCsv, rowScope, setRowScope } = usePlaque(
    useShallow((s) => ({
      headers: s.headers,
      rows: s.rows,
      csvIssues: s.csvIssues,
      fileName: s.fileName,
      setCsv: s.setCsv,
      rowScope: s.template.rowScope ?? PER_ROW,
      setRowScope: s.setRowScope,
    })),
  );
  // Counting is cheap and it is the only honest way to say what the scope did.
  const artefactCount = buildArtefacts(rows, rowScope, headers).length;
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!/\.(csv|txt)$/i.test(file.name)) {
      setError(`"${file.name}" is not a CSV file.`);
      return;
    }
    const parsed = parseCsv(await file.text());
    if (parsed.headers.length === 0) {
      setError(parsed.issues[0]?.message ?? "That file had no columns.");
      return;
    }
    setCsv({ ...parsed, fileName: file.name });
  }

  return (
    <>
      <div
        className={over ? `${styles.drop} ${styles.over}` : styles.drop}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void accept(e.dataTransfer.files[0]);
        }}
      >
        <p className={styles.dropText}>Drop a CSV here</p>
        <button type="button" className={styles.button} onClick={() => input.current?.click()}>
          Choose file
        </button>
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          className={styles.hidden}
          onChange={(e) => {
            void accept(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {fileName && (
        <Hint>
          <strong>{fileName}</strong> — {rows.length} {rows.length === 1 ? "guest" : "guests"},{" "}
          {headers.length} columns.
        </Hint>
      )}

      {headers.length > 0 && (
        <>
          <SelectField
            label="Print one artefact per"
            value={scopeValue(rowScope)}
            options={[
              { value: "per-row", label: "Row — place cards, badges, tags" },
              ...headers.map((h) => ({ value: `group:${h}`, label: `Group by ${h} — menus, table cards` })),
              { value: "document", label: "The whole list — run-sheet, seating list" },
            ]}
            onChange={(value) => setRowScope(parseScope(value))}
          />
          <Hint>
            {scopeHint(rowScope, rows.length, artefactCount)}
          </Hint>
        </>
      )}

      {headers.length > 0 && (
        <SubGroup title={`Columns (${headers.length})`}>
          <div className={styles.tokens}>
            {headers.map((h) => (
              <code key={h} className={styles.token} title="Use this in any text element">
                {`{{${h}}}`}
              </code>
            ))}
          </div>
        </SubGroup>
      )}

      {csvIssues.length > 0 && (
        <details className={styles.issues}>
          <summary>
            {csvIssues.length} {csvIssues.length === 1 ? "row needs" : "rows need"} a look
          </summary>
          <ul>
            {csvIssues.slice(0, 20).map((issue, i) => (
              <li key={i}>{issue.message}</li>
            ))}
            {csvIssues.length > 20 && <li>…and {csvIssues.length - 20} more.</li>}
          </ul>
        </details>
      )}
    </>
  );
}
