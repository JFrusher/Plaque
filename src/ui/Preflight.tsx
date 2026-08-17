import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import type { Issue } from "../core/geometry/validate";
import type { GuestWarning } from "../core/imposition/paginate";
import { paginate } from "../core/imposition/paginate";
import { hasBackSide } from "../core/imposition/duplex";
import { estimatePdfBytes, formatBytes } from "../core/print/estimate";
import {
  backCorrection,
  describeScale,
  effectiveScale,
  isNotableDrift,
  type PrinterProfile,
} from "../core/print/printerProfile";
import type { Artefact } from "../core/data/artefacts";
import type { MissingAsset } from "../core/template/assets";
import { makeResolveOptions } from "../core/template/resolve";
import type { Template } from "../core/types";
import { SheetPreview } from "../render/svg/SheetPreview";
import { usePlaque } from "../state/store";
import styles from "./Preflight.module.css";

export type PreflightChoice = "all" | "first" | "test" | "duplex-test";

export interface PreflightProps {
  sheetCount: number;
  artefacts: Artefact[];
  issues: Issue[];
  warnings: GuestWarning[];
  missing: MissingAsset[];
  onChoose: (choice: PreflightChoice) => void;
  onCancel: () => void;
}

/** Thumbnails are cheap per sheet but not free; six is enough to spot a problem. */
const THUMBNAILS = 6;

/**
 * Duplex is the setting most likely to be on while doing nothing, so the
 * preflight says plainly what will come out of the printer.
 */
function duplexSummary(
  template: Template,
  sheetCount: number,
  printer: PrinterProfile | null,
): string {
  if (!hasBackSide(template)) {
    return "on, but nothing is on the back — printing one side only";
  }
  const { dx, dy } = backCorrection(printer);
  const flip = `${printer?.flipEdge ?? "long"}-edge flip`;
  const shift = dx === 0 && dy === 0 ? "no back-side correction" : `back shifted ${dx}mm, ${dy}mm`;
  return `${sheetCount * 2} pages on ${sheetCount} ${sheetCount === 1 ? "sheet" : "sheets"} · ${flip} · ${shift}`;
}

/**
 * S-D2.5 — the one honest checkpoint before the download.
 *
 * Everything uncertain about the print is stated here in plain numbers, and the
 * two cheap ways out — one sheet, or two cards on plain paper — are one click
 * each rather than buried in export options. Cancelling touches no state.
 */
export function Preflight({
  sheetCount,
  artefacts,
  issues,
  warnings,
  missing,
  onChoose,
  onCancel,
}: PreflightProps) {
  const { card, sheet, template, fonts, images, uploadedIcons, assetNames, printer } =
    usePlaque(
      useShallow((s) => ({
        card: s.card,
        sheet: s.sheet,
        template: s.template,
        fonts: s.fonts,
        images: s.images,
        uploadedIcons: s.uploadedIcons,
        assetNames: s.assetNames,
        printer: s.printers.find((p) => p.id === s.activePrinterId) ?? null,
      })),
    );

  const resolveOptions = useMemo(
    () => makeResolveOptions(fonts, uploadedIcons, images, assetNames),
    [fonts, uploadedIcons, images, assetNames],
  );

  // Only the sheets shown as thumbnails are imposed.
  const thumbnails = useMemo(() => {
    const to = Math.min(sheetCount, THUMBNAILS) - 1;
    if (to < 0) return [];
    return paginate(template, artefacts, card, sheet, resolveOptions, { pages: { from: 0, to } })
      .sheets;
  }, [template, artefacts, card, sheet, resolveOptions, sheetCount]);

  const amberRows = new Set(warnings.filter((w) => w.kind === "overflow").map((w) => w.artefactIndex));
  const redRows = new Set(
    warnings
      .filter((w) => w.kind === "missing-image" || w.kind === "missing-font")
      .map((w) => w.artefactIndex),
  );
  const errors = issues.filter((i) => i.severity === "error");
  const scale = effectiveScale(printer?.scale);

  const estimate = useMemo(() => {
    const usedFontIds = new Set(
      template.elements.flatMap((el) => (el.kind === "text" ? [el.fontId] : [])),
    );
    const usedImageIds = new Set(
      template.elements.flatMap((el) => (el.kind === "image" && el.imageId ? [el.imageId] : [])),
    );
    const textElements = template.elements.filter((el) => el.kind === "text").length;
    return estimatePdfBytes({
      pageCount: sheetCount,
      fontBytes: [...usedFontIds].map((id) => fonts.get(id)?.data.byteLength ?? 0),
      imageBytes: [...usedImageIds].map((id) => images.get(id)?.data.byteLength ?? 0),
      textDraws: textElements * artefacts.length,
    });
  }, [template, fonts, images, sheetCount, artefacts.length]);

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="Before you print">
      <div className={styles.panel}>
        <h2 className={styles.title}>Before you print</h2>

        <dl className={styles.facts}>
          <div>
            <dt>Sheets</dt>
            <dd>
              {sheetCount} for {artefacts.length} {artefacts.length === 1 ? "card" : "cards"}
            </dd>
          </div>
          <div>
            <dt>Estimated file</dt>
            <dd>about {formatBytes(estimate)}</dd>
          </div>
          <div>
            <dt>Printer correction</dt>
            <dd>
              {printer && isNotableDrift(scale)
                ? `${printer.name}, ${describeScale(scale)} (×${scale.toFixed(3)})`
                : "none — printing at the sizes you set"}
            </dd>
          </div>
          {sheet.duplex && (
            <div>
              <dt>Double-sided</dt>
              <dd>{duplexSummary(template, sheetCount, printer)}</dd>
            </div>
          )}
          <div>
            <dt>Problems</dt>
            <dd>
              <span className={redRows.size + errors.length > 0 ? styles.red : styles.quiet}>
                {redRows.size + errors.length} blocking
              </span>
              {" · "}
              <span className={amberRows.size > 0 ? styles.amber : styles.quiet}>
                {amberRows.size} {amberRows.size === 1 ? "row" : "rows"} that will not fit
              </span>
            </dd>
          </div>
        </dl>

        {card.bleedMm > 0 && (
          <p className={styles.reminder}>
            {card.bleedMm}mm of bleed is drawn past the cut line on every card. It is meant to be
            trimmed off — the finished card is {card.widthMm} × {card.heightMm}mm.
          </p>
        )}

        {missing.length > 0 && (
          <p className={styles.red}>
            {missing.length} missing {missing.length === 1 ? "file" : "files"}. Relink them before
            printing.
          </p>
        )}

        <div className={styles.thumbs}>
          {thumbnails.map((s) => (
            <figure key={s.index} className={styles.thumb}>
              <SheetPreview sheet={s} fonts={fonts} className={styles.sheet} />
              <figcaption>Sheet {s.index + 1}</figcaption>
            </figure>
          ))}
          {sheetCount > THUMBNAILS && (
            <p className={styles.quiet}>and {sheetCount - THUMBNAILS} more</p>
          )}
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={() => onChoose("all")}>
            Download all {sheetCount} {sheetCount === 1 ? "sheet" : "sheets"}
          </button>
          <button type="button" className={styles.button} onClick={() => onChoose("first")}>
            Sheet 1 only
          </button>
          <button type="button" className={styles.button} onClick={() => onChoose("test")}>
            Two test cards on plain paper
          </button>
          {sheet.duplex && hasBackSide(template) && (
            <button type="button" className={styles.button} onClick={() => onChoose("duplex-test")}>
              Duplex test sheet first
            </button>
          )}
          <button type="button" className={styles.button} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
