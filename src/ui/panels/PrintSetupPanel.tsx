import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  REFERENCE_RULE_MM,
  describeScale,
  isNotableDrift,
  scaleFromMeasurement,
  type PrinterProfile,
} from "../../core/print/printerProfile";
import { newId } from "../../core/template/defaults";
import { savePrinters } from "../../state/printerStore";
import { usePlaque } from "../../state/store";
import { Hint, SelectField, SubGroup } from "../controls";
import { DuplexCard } from "./DuplexCard";
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
  // null means "not touched here", so the field always shows the active
  // printer's stored value rather than a number typed against another machine.
  const [margin, setMargin] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const active = printers.find((p) => p.id === activePrinterId) ?? null;
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
   * Printer-mechanism settings attach to the profile, creating one if the user
   * measured a border before calibrating.
   */
  function saveProfile(patch: Partial<PrinterProfile>) {
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
    <>
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
            setMargin(null);
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

      <SubGroup title="Scale">
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
      </SubGroup>

      <SubGroup title="Unprintable border" open={false}>
      <label className={styles.field}>
        <span>Unprintable border, measured (mm)</span>
        <input
          type="number"
          className={styles.input}
          value={margin ?? storedMargin}
          step={0.5}
          min={0}
          placeholder="from the corner crosses"
          onChange={(e) => setMargin(e.target.value)}
          onBlur={() => {
            const value = Number.parseFloat(margin ?? "");
            if (Number.isFinite(value) && value >= 0) saveProfile({ unprintableMarginMm: value });
          }}
        />
      </label>
      <Hint>
        The calibration page prints four crosses 10mm from each paper edge. If one is missing or
        clipped, that edge cannot be reached — put the measurement here and Plaque warns when a fold
        guide or bleed lands inside it.
      </Hint>
      </SubGroup>

      <SubGroup title="Double-sided" open={false}>
      <DuplexCard key={activePrinterId ?? "none"} />
      </SubGroup>

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
    </>
  );
}
