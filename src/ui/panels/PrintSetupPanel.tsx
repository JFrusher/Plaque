import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  REFERENCE_RULE_MM,
  backCorrection,
  describeScale,
  isNotableDrift,
  readingToCorrection,
  scaleFromMeasurement,
  type PrinterProfile,
} from "../../core/print/printerProfile";
import { newId } from "../../core/template/defaults";
import { savePrinters } from "../../state/printerStore";
import { usePlaque } from "../../state/store";
import { Hint, Panel, SelectField } from "../controls";
import styles from "./PrintSetupPanel.module.css";

/**
 * S-D2.1 — prove the printer before cutting stock.
 *
 * The single highest-value screen in the app: a driver that quietly scales to
 * 97% is the difference between cards that fit their envelopes and forty wasted
 * sheets of 350gsm.
 */
export function PrintSetupPanel() {
  const { printers, activePrinterId, page, orientation } = usePlaque(
    useShallow((s) => ({
      printers: s.printers,
      activePrinterId: s.activePrinterId,
      page: s.sheet.page,
      orientation: s.sheet.orientation,
    })),
  );
  const [measured, setMeasured] = useState("");
  const [name, setName] = useState("");
  const [margin, setMargin] = useState("");
  const [acrossReading, setAcrossReading] = useState("");
  const [downReading, setDownReading] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const active = printers.find((p) => p.id === activePrinterId) ?? null;
  const { dx: backOffsetX, dy: backOffsetY } = backCorrection(active);
  const storedMargin =
    typeof active?.unprintableMarginMm === "number" ? String(active.unprintableMarginMm) : "";

  /** Every mutation writes through to IndexedDB; there is no separate save step. */
  async function persist() {
    const s = usePlaque.getState();
    try {
      await savePrinters(s.printers, s.activePrinterId);
    } catch {
      setError("This browser would not store the printer profile.");
    }
  }

  async function printCalibration() {
    setBusy(true);
    setError(null);
    try {
      const { calibrationPdf } = await import("../../render/pdf/calibrationPdf");
      const bytes = await calibrationPdf({
        page,
        orientation,
        ...(active?.name ? { printerName: active.name } : {}),
      });
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "plaque-calibration.pdf";
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The calibration page could not be built.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Duplex settings describe the printer's mechanism, so they attach to the
   * profile — creating one if the user reached duplex before calibration.
   */
  function saveDuplex(patch: Partial<PrinterProfile>) {
    setError(null);
    const s = usePlaque.getState();
    s.upsertPrinter({
      id: active?.id ?? newId(),
      name: active?.name ?? (name.trim() || "This printer"),
      scale: active?.scale ?? 1,
      measuredMm: active?.measuredMm ?? null,
      calibratedAt: active?.calibratedAt ?? null,
      ...(active ?? {}),
      ...patch,
    });
    void persist();
  }

  async function printDuplexTest() {
    setBusy(true);
    setError(null);
    try {
      const { duplexTestPdf } = await import("../../render/pdf/duplexTestPdf");
      const bytes = await duplexTestPdf({
        page,
        orientation,
        flipEdge: active?.flipEdge ?? "long",
        backOffsetXMm: backOffsetX,
        backOffsetYMm: backOffsetY,
      });
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
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

  function saveMeasurement() {
    setError(null);
    const result = scaleFromMeasurement(Number.parseFloat(measured));
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    const s = usePlaque.getState();
    const profileName = (active?.name ?? name).trim() || "This printer";
    s.upsertPrinter({
      id: active?.id ?? newId(),
      name: profileName,
      scale: result.scale,
      measuredMm: Number.parseFloat(measured),
      calibratedAt: new Date().toISOString(),
    });
    setMeasured("");
    setName("");
    void persist();
  }

  return (
    <Panel title="Print setup" open={false}>
      {printers.length > 0 && (
        <SelectField
          label="Printer"
          value={activePrinterId ?? ""}
          options={[
            { value: "", label: "None — no correction" },
            ...printers.map((p) => ({ value: p.id, label: p.name })),
          ]}
          onChange={(id) => {
            usePlaque.getState().setActivePrinter(id || null);
            void persist();
          }}
        />
      )}

      {active ? (
        <p className={isNotableDrift(active.scale) ? styles.applied : styles.neutral}>
          {active.name}: printing {describeScale(active.scale)} (×{active.scale.toFixed(3)}).
          {active.measuredMm !== null && ` Measured ${active.measuredMm}mm for the ${REFERENCE_RULE_MM}mm rule.`}
        </p>
      ) : (
        <Hint>
          No printer calibrated. Exports go out at exactly the sizes you set, which is right until a
          driver decides otherwise.
        </Hint>
      )}

      <button type="button" className={styles.button} disabled={busy} onClick={() => void printCalibration()}>
        {busy ? "Building…" : "Download calibration page"}
      </button>

      <div className={styles.measure}>
        {!active && (
          <label className={styles.field}>
            <span>Printer name</span>
            <input
              type="text"
              className={styles.input}
              value={name}
              placeholder="Kitchen inkjet"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        )}
        <label className={styles.field}>
          <span>Measured length of the {REFERENCE_RULE_MM}mm rule</span>
          <input
            type="number"
            className={styles.input}
            value={measured}
            step={0.1}
            placeholder={String(REFERENCE_RULE_MM)}
            onChange={(e) => setMeasured(e.target.value)}
          />
        </label>
        <button
          type="button"
          className={styles.button}
          disabled={measured.trim() === ""}
          onClick={saveMeasurement}
        >
          {active ? "Update correction" : "Save correction"}
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <label className={styles.field}>
        <span>Unprintable border, measured (mm)</span>
        <input
          type="number"
          className={styles.input}
          value={margin !== "" ? margin : storedMargin}
          step={0.5}
          min={0}
          placeholder="from the corner crosses"
          onChange={(e) => setMargin(e.target.value)}
          onBlur={() => {
            const value = Number.parseFloat(margin);
            if (Number.isFinite(value) && value >= 0) saveDuplex({ unprintableMarginMm: value });
          }}
        />
      </label>
      <Hint>
        The calibration page prints four crosses 10mm from each paper edge. If one is missing or
        clipped, that edge cannot be reached — put the measurement here and Plaque warns when a fold
        guide or bleed lands inside it.
      </Hint>

      <h3 className={styles.heading}>Double-sided</h3>
      <SelectField
        label="Flip edge"
        value={active?.flipEdge ?? "long"}
        options={[
          { value: "long", label: "Long edge (most printers)" },
          { value: "short", label: "Short edge" },
        ]}
        onChange={(flipEdge) => saveDuplex({ flipEdge })}
      />
      <button
        type="button"
        className={styles.button}
        disabled={busy}
        onClick={() => void printDuplexTest()}
      >
        {busy ? "Building…" : "Download duplex test sheet"}
      </button>
      <Hint>
        Print it duplex on plain paper, hold it to a window, and read the two scales on the back
        where the front's lines cross them. Those numbers go straight in below — no arithmetic.
      </Hint>

      <div className={styles.measure}>
        <label className={styles.field}>
          <span>Station A "across" reading (mm)</span>
          <input
            type="number"
            className={styles.input}
            value={acrossReading}
            step={0.1}
            placeholder="0"
            onChange={(e) => setAcrossReading(e.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span>Station A "down" reading (mm)</span>
          <input
            type="number"
            className={styles.input}
            value={downReading}
            step={0.1}
            placeholder="0"
            onChange={(e) => setDownReading(e.target.value)}
          />
        </label>
        <button
          type="button"
          className={styles.button}
          disabled={acrossReading.trim() === "" && downReading.trim() === ""}
          onClick={() =>
            saveDuplex({
              backOffsetXMm: readingToCorrection(Number.parseFloat(acrossReading || "0")),
              backOffsetYMm: readingToCorrection(Number.parseFloat(downReading || "0")),
            })
          }
        >
          Save back-side alignment
        </button>
      </div>

      {active && (backOffsetX !== 0 || backOffsetY !== 0) && (
        <p className={styles.applied}>
          Back pages shifted {backOffsetX}mm across, {backOffsetY}mm down. Print the test sheet again
          — both scales should read 0.
        </p>
      )}

      {active && (
        <button
          type="button"
          className={styles.link}
          onClick={() => {
            usePlaque.getState().removePrinter(active.id);
            void persist();
          }}
        >
          Forget this printer
        </button>
      )}

      <Hint>
        Print the page at 100% — turn off "fit to page" — measure the rule, and type what you read.
        Every export after that is corrected, and the factor is printed on the sheet so a bad print
        explains itself.
      </Hint>
    </Panel>
  );
}
