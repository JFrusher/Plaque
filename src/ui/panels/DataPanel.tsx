import { useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { parseCsv } from "../../core/csv/parse";
import { usePlaque } from "../../state/store";
import { Hint, Panel } from "../controls";
import styles from "./DataPanel.module.css";

/** FR-STA-01. Drag-and-drop or pick a CSV; every column becomes a bindable token. */
export function DataPanel() {
  const { headers, rows, csvIssues, fileName, setCsv } = usePlaque(
    useShallow((s) => ({
      headers: s.headers,
      rows: s.rows,
      csvIssues: s.csvIssues,
      fileName: s.fileName,
      setCsv: s.setCsv,
    })),
  );
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
    <Panel title="Guest list">
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
        <div className={styles.tokens}>
          {headers.map((h) => (
            <code key={h} className={styles.token} title="Use this in any text element">
              {`{{${h}}}`}
            </code>
          ))}
        </div>
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
    </Panel>
  );
}
