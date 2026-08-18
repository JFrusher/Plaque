import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  READABLE_SPAN_MM,
  SKEW_THRESHOLD_MM,
  backCorrection,
  correctionFromReadings,
  type PrinterProfile,
} from "../../core/print/printerProfile";
import { newId } from "../../core/template/defaults";
import { savePrinters } from "../../state/printerStore";
import { usePlaque } from "../../state/store";
import { Hint, SelectField } from "../controls";
import styles from "./PrintSetupPanel.module.css";

/**
 * S-D2.2 — the two questions a duplex print can get wrong, in the order the
 * test sheet answers them.
 *
 * The card exists to be a transcription surface and nothing more: every field
 * here is named after a label that is *printed on the sheet in the user's hand*,
 * so the job is reading a number off paper and typing it in the box with the
 * same name. Anything that made the user work out a sign, an axis or a mean
 * would be a chance to ruin a run of backs, so none of it is asked for.
 *
 * See render/pdf/duplexTestPdf for the sheet, and core/print/printerProfile for
 * why the readings add to the stored correction rather than replacing it.
 */
export function DuplexCard() {
  const { printers, activePrinterId, page, orientation } = usePlaque(
    useShallow((s) => ({
      printers: s.printers,
      activePrinterId: s.activePrinterId,
      page: s.sheet.page,
      orientation: s.sheet.orientation,
    })),
  );
  const active = printers.find((p) => p.id === activePrinterId) ?? null;

  // Keyed on the printer in PrintSetupPanel, so half-typed readings can never
  // survive a switch and land on the wrong machine.
  const [readings, setReadings] = useState({ aAcross: "", aDown: "", bAcross: "", bDown: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const existing = backCorrection(active);
  const flipEdge = active?.flipEdge ?? "long";
  const typed = Object.values(readings).filter((v) => v.trim() !== "");
  const parsed = {
    aAcross: parse(readings.aAcross),
    aDown: parse(readings.aDown),
    bAcross: parse(readings.bAcross),
    bDown: parse(readings.bDown),
  };
  const unreadable = Object.values(parsed).some((v) => Math.abs(v) > READABLE_SPAN_MM);
  const next = correctionFromReadings(parsed, existing);
  const changesNothing = next.dx === existing.dx && next.dy === existing.dy;

  async function persist() {
    const s = usePlaque.getState();
    try {
      await savePrinters(s.printers, s.activePrinterId);
    } catch {
      setError("This browser would not store the printer profile.");
    }
  }

  /**
   * Duplex settings describe the printer's mechanism, so they attach to the
   * profile — creating one if the user reached duplex before calibration.
   */
  function saveDuplex(patch: Partial<PrinterProfile>) {
    setError(null);
    usePlaque.getState().upsertPrinter({
      id: newId(),
      name: "This printer",
      scale: 1,
      measuredMm: null,
      calibratedAt: null,
      ...(active ?? {}),
      ...patch,
    });
    void persist();
  }

  async function downloadTest() {
    setBusy(true);
    setError(null);
    try {
      const { duplexTestPdf } = await import("../../render/pdf/duplexTestPdf");
      const bytes = await duplexTestPdf({
        page,
        orientation,
        flipEdge,
        backOffsetXMm: existing.dx,
        backOffsetYMm: existing.dy,
      });
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "plaque-duplex-test.pdf";
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The duplex test sheet could not be built.");
    } finally {
      setBusy(false);
    }
  }

  function apply() {
    saveDuplex({ backOffsetXMm: next.dx, backOffsetYMm: next.dy });
    setReadings({ aAcross: "", aDown: "", bAcross: "", bDown: "" });
    setSaved(true);
  }

  const onReading = (key: keyof typeof readings) => (value: string) => {
    setReadings((r) => ({ ...r, [key]: value }));
    setSaved(false);
  };

  return (
    <>
      {/* The heading is the SubGroup that wraps this in PrintSetupPanel. */}
      <p className={styles.state}>
        {existing.dx === 0 && existing.dy === 0
          ? "No back-side correction yet — backs print exactly where the design puts them."
          : `Back pages move ${describeShift(existing.dx, existing.dy)} before printing.`}
      </p>

      <ol className={styles.steps}>
        <li>
          <SelectField
            label="1. Flip edge"
            value={flipEdge}
            options={[
              { value: "long", label: "Long edge (most printers)" },
              { value: "short", label: "Short edge" },
            ]}
            onChange={(edge) => saveDuplex({ flipEdge: edge })}
          />
          <Hint>
            Whichever edge your printer turns the paper about. Wrong here and every card's back
            lands on a different card — the test sheet's witness mark says which it is.
          </Hint>
        </li>

        <li>
          <button type="button" className={styles.button} disabled={busy} onClick={() => void downloadTest()}>
            {busy ? "Building…" : "2. Download duplex test sheet"}
          </button>
          <Hint>
            Print both pages on one sheet, duplex, at 100% — no "fit to page" — on plain paper you
            can see through. Then read the <strong>back</strong> page against a window.
          </Hint>
        </li>

        <li>
          <span className={styles.stepLabel}>3. Type in what the four scales read</span>
          <div className={styles.readings}>
            <Reading label="A across" value={readings.aAcross} onChange={onReading("aAcross")} />
            <Reading label="A down" value={readings.aDown} onChange={onReading("aDown")} />
            <Reading label="B across" value={readings.bAcross} onChange={onReading("bAcross")} />
            <Reading label="B down" value={readings.bDown} onChange={onReading("bDown")} />
          </div>
          <Hint>
            Each scale is named on the sheet exactly as it is here. Leave a box empty for a scale
            that reads 0. Readings add to the correction already applied, so a retest only has to
            measure what is left.
          </Hint>

          {unreadable && (
            <p className={styles.error}>
              The printed scales only run to ±{READABLE_SPAN_MM}mm. A bigger reading means the wrong
              scale was read, or the sheet fed badly.
            </p>
          )}

          {next.skewed && !unreadable && (
            <p className={styles.warn}>
              A and B disagree by {next.skewMm}mm — more than {SKEW_THRESHOLD_MM}mm apart means the
              sheet went through skewed. Shifting the back cannot fix a rotation: feed the paper
              straight and print the test again.
            </p>
          )}

          {typed.length > 0 && !unreadable && (
            <p className={styles.state}>
              {changesNothing
                ? "That leaves the correction where it is — the backs are already registered."
                : `Will move back pages ${describeShift(next.dx, next.dy)}.`}
            </p>
          )}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.button}
              disabled={typed.length === 0 || unreadable}
              onClick={apply}
            >
              Apply readings
            </button>
            {(existing.dx !== 0 || existing.dy !== 0) && (
              <button
                type="button"
                className={styles.link}
                onClick={() => saveDuplex({ backOffsetXMm: 0, backOffsetYMm: 0 })}
              >
                Start again from zero
              </button>
            )}
          </div>

          {saved && (
            <p className={styles.ok}>
              Saved. Print the test sheet again — all four scales should now read 0.
            </p>
          )}
        </li>
      </ol>

      {error && <p className={styles.error}>{error}</p>}
    </>
  );
}

function Reading({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input
        type="number"
        className={styles.input}
        value={value}
        step={0.1}
        min={-READABLE_SPAN_MM}
        max={READABLE_SPAN_MM}
        placeholder="0"
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

/** A blank box is a scale that reads zero, which is the common case on a retest. */
function parse(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * "0.4mm left and 0.3mm down" — directions, not signs. The stored numbers are
 * signed, but nobody checks a print by remembering which way negative goes.
 */
function describeShift(dx: number, dy: number): string {
  const parts = [
    dx === 0 ? null : `${Math.abs(dx)}mm ${dx > 0 ? "right" : "left"}`,
    dy === 0 ? null : `${Math.abs(dy)}mm ${dy > 0 ? "down" : "up"}`,
  ].filter(Boolean);
  return parts.length === 0 ? "nowhere" : parts.join(" and ");
}
