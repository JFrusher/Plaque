import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { hasErrors, type Issue } from "../core/geometry/validate";
import type { GuestWarning } from "../core/imposition/paginate";
import { buildJob } from "../core/job";
import {
  backCorrection,
  describeScale,
  effectiveScale,
  isNotableDrift,
} from "../core/print/printerProfile";
import type { MissingAsset } from "../core/template/assets";
import type { Artefact } from "../core/data/artefacts";
import { makeResolveOptions } from "../core/template/resolve";
import { usePlaque } from "../state/store";
import styles from "./ExportBar.module.css";
import { Preflight, type PreflightChoice } from "./Preflight";

/** Two is enough to check size, fit and colour, and wastes nothing. */
const TEST_CARDS = 2;

const SUFFIX: Record<PreflightChoice, string> = {
  all: "",
  first: "-sheet-1",
  test: "-test-cards",
  "duplex-test": "-duplex-test",
};

/** A Blob copy, because pdf-lib reuses the underlying buffer after save(). */
function save(bytes: Uint8Array, fileName: string): void {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface ExportBarProps {
  sheetCount: number;
  /**
   * Every blocking problem App knows about — geometry, ink-on-stock contrast and
   * tokens naming a column that does not exist. Computed once, there, so the bar
   * and the warnings list cannot disagree about what is wrong.
   */
  issues: Issue[];
  /** What gets printed: one per guest, one per table, or one for the whole list. */
  artefacts: Artefact[];
  /** Already computed by App for the warnings list; the preflight counts them. */
  warnings: GuestWarning[];
  /**
   * Assets the design references and this device does not have. Export is
   * blocked while any exist: a PDF with a silently blank crest is a wasted sheet
   * of card stock (S-D1.4).
   */
  missing: MissingAsset[];
}

/** The primary action. Everything else on screen exists to make this button correct. */
export function ExportBar({ sheetCount, issues, artefacts, warnings, missing }: ExportBarProps) {
  const { card, sheet, template, rows, headers, rowIds, fonts, images, uploadedIcons, fileName, assetNames, printer } =
    usePlaque(
      useShallow((s) => ({
        card: s.card,
        sheet: s.sheet,
        template: s.template,
        rows: s.rows,
        headers: s.headers,
        rowIds: s.rowIds,
        fonts: s.fonts,
        images: s.images,
        uploadedIcons: s.uploadedIcons,
        fileName: s.fileName,
        assetNames: s.assetNames,
        printer: s.printers.find((p) => p.id === s.activePrinterId) ?? null,
      })),
    );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [preflight, setPreflight] = useState(false);

  const blocked =
    hasErrors(issues) || artefacts.length === 0 || sheetCount === 0 || missing.length > 0;

  /**
   * `"test"` is A6: the first two cards, at true scale, with cut lines on, on
   * one sheet of whatever is already in the printer. It exists so nobody's first
   * print is onto 350gsm — and it goes through exactly the same pipeline, printer
   * correction included, or it would prove nothing.
   */
  /** The registration proof, offered at the moment it is worth most: before the run. */
  async function downloadDuplexTest() {
    setBusy(true);
    setError(null);
    try {
      const { duplexTestPdf } = await import("../render/pdf/duplexTestPdf");
      const { dx, dy } = backCorrection(printer);
      const bytes = await duplexTestPdf({
        page: sheet.page,
        orientation: sheet.orientation,
        flipEdge: printer?.flipEdge ?? "long",
        backOffsetXMm: dx,
        backOffsetYMm: dy,
      });
      save(bytes, "plaque-duplex-test.pdf");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The duplex test sheet could not be built.");
    } finally {
      setBusy(false);
    }
  }

  async function download(variant: PreflightChoice = "all") {
    if (variant === "duplex-test") return downloadDuplexTest();
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      // pdf-lib and its fontkit are most of the bundle and are only needed at
      // this moment, so they load on the first export rather than on page open.
      const { renderPdf } = await import("../render/pdf/renderPdf");
      const test = variant === "test";
      // The same pipeline the CLI runs — see core/job. Nothing about imposition,
      // duplex or the slug lines lives in this component.
      const job = buildJob({
        template,
        card,
        sheet: test ? { ...sheet, cutLines: true } : sheet,
        rows,
        headers,
        rowIds,
        resolve: makeResolveOptions(fonts, uploadedIcons, images, assetNames),
        scale: effectiveScale(printer?.scale),
        ...(sheet.duplex
          ? {
              duplex: {
                flipEdge: printer?.flipEdge ?? "long",
                backOffsetXMm: backCorrection(printer).dx,
                backOffsetYMm: backCorrection(printer).dy,
              },
            }
          : {}),
        ...(variant === "all" ? {} : { pages: { from: 0, to: 0 } }),
        ...(test ? { limit: TEST_CARDS } : {}),
      });

      const { bytes, notSubset } = await renderPdf({
        sheets: job.sheets,
        fonts,
        title: test ? `${nameFor(fileName)} — test cards` : nameFor(fileName),
        scale: effectiveScale(printer?.scale),
        // A test print always carries the slug: it is the run where knowing the
        // applied scale and seeing a printed rule is worth most.
        ...(sheet.slugLine || test
          ? { slug: { texts: job.slugTexts, ruleMm: job.slugRuleMm } }
          : {}),
      });
      // A face that would not subset makes for a much larger file. The export
      // still succeeded, so this is a note, not an error.
      setNote(
        notSubset.length > 0
          ? `${notSubset.join(", ")} could not be reduced, so the PDF is larger than usual.`
          : null,
      );
      save(bytes, `${nameFor(fileName)}${SUFFIX[variant]}.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The PDF could not be generated.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.bar}>
      {preflight && (
        <Preflight
          sheetCount={sheetCount}
          artefacts={artefacts}
          issues={issues}
          warnings={warnings}
          missing={missing}
          onCancel={() => setPreflight(false)}
          onChoose={(choice) => {
            setPreflight(false);
            void download(choice);
          }}
        />
      )}

      <button
        type="button"
        className={styles.primary}
        disabled={blocked || busy}
        onClick={() => setPreflight(true)}
      >
        {busy ? "Generating…" : "Download print-ready PDF"}
      </button>
      <button
        type="button"
        className={styles.secondary}
        disabled={blocked || busy}
        title="The first two cards on one sheet, at true scale, with cut lines — print this on plain paper first."
        onClick={() => void download("test")}
      >
        Two test cards
      </button>
      <span className={styles.meta}>
        {missingLabel(missing, assetNames) ??
          (artefacts.length === 0
            ? "Upload a guest list to begin"
            : `${artefacts.length} ${artefacts.length === 1 ? "card" : "cards"} · ${sheetCount} ${sheetCount === 1 ? "sheet" : "sheets"}`)}
      </span>
      {printer && isNotableDrift(printer.scale) && (
        <span className={styles.note}>
          {printer.name}: printing {describeScale(printer.scale)}.
        </span>
      )}
      {error && <span className={styles.error}>{error}</span>}
      {note && <span className={styles.note}>{note}</span>}
    </div>
  );
}

/** Names the files to find, rather than "export is unavailable". */
function missingLabel(
  missing: MissingAsset[],
  assetNames: Record<string, string>,
): string | null {
  if (missing.length === 0) return null;
  const names = missing.map((asset) => assetNames[asset.id] ?? asset.id);
  return `Blocked: ${names.join(", ")} ${names.length === 1 ? "is" : "are"} missing from this device.`;
}

function nameFor(fileName: string | null): string {
  if (!fileName) return "place-cards";
  return fileName.replace(/\.[^.]+$/, "") || "place-cards";
}
