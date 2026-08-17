import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { hasErrors, validateGeometry } from "../core/geometry/validate";
import { paginate } from "../core/imposition/paginate";
import { makeResolveOptions } from "../core/template/resolve";
import { usePlaque } from "../state/store";
import styles from "./ExportBar.module.css";

export interface ExportBarProps {
  sheetCount: number;
}

/** The primary action. Everything else on screen exists to make this button correct. */
export function ExportBar({ sheetCount }: ExportBarProps) {
  const { card, sheet, template, rows, fonts, images, uploadedIcons, fileName } = usePlaque(
    useShallow((s) => ({
      card: s.card,
      sheet: s.sheet,
      template: s.template,
      rows: s.rows,
      fonts: s.fonts,
      images: s.images,
      uploadedIcons: s.uploadedIcons,
      fileName: s.fileName,
    })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const issues = validateGeometry(card, sheet);
  const blocked = hasErrors(issues) || rows.length === 0 || sheetCount === 0;

  async function download() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      // pdf-lib and its fontkit are most of the bundle and are only needed at
      // this moment, so they load on the first export rather than on page open.
      const { renderPdf } = await import("../render/pdf/renderPdf");
      const { sheets } = paginate(
        template,
        rows,
        card,
        sheet,
        makeResolveOptions(fonts, uploadedIcons, images),
      );
      const { bytes, notSubset } = await renderPdf({ sheets, fonts, title: nameFor(fileName) });
      // A face that would not subset makes for a much larger file. The export
      // still succeeded, so this is a note, not an error.
      setNote(
        notSubset.length > 0
          ? `${notSubset.join(", ")} could not be reduced, so the PDF is larger than usual.`
          : null,
      );
      // A Blob copy, because the underlying buffer is reused after save().
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${nameFor(fileName)}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The PDF could not be generated.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.bar}>
      <button
        type="button"
        className={styles.primary}
        disabled={blocked || busy}
        onClick={() => void download()}
      >
        {busy ? "Generating…" : "Download print-ready PDF"}
      </button>
      <span className={styles.meta}>
        {rows.length === 0
          ? "Upload a guest list to begin"
          : `${rows.length} ${rows.length === 1 ? "card" : "cards"} · ${sheetCount} ${sheetCount === 1 ? "sheet" : "sheets"}`}
      </span>
      {error && <span className={styles.error}>{error}</span>}
      {note && <span className={styles.note}>{note}</span>}
    </div>
  );
}

function nameFor(fileName: string | null): string {
  if (!fileName) return "place-cards";
  return fileName.replace(/\.[^.]+$/, "") || "place-cards";
}
