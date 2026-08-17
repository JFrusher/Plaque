import { buildArtefacts } from "./data/artefacts";
import type { GuestRow } from "./csv/parse";
import {
  hasBackSide,
  interleave,
  mirrorAxisFor,
  mirrorSheet,
  offsetSheet,
  templateForSide,
  type FlipEdge,
} from "./imposition/duplex";
import { paginate, type GuestWarning } from "./imposition/paginate";
import { effectiveScale } from "./print/printerProfile";
import { SLUG_RULE_MM, buildFingerprint, slugText } from "./print/slug";
import type { ResolveOptions } from "./template/bindings";
import type { CardSpec, Sheet, SheetSpec, Template } from "./types";

/**
 * One job, from data to sheets.
 *
 * The whole pipeline in one pure function so the browser and the CLI cannot
 * drift: rows become artefacts, artefacts become sheets, duplex backs are
 * mirrored and corrected, and the slug lines are composed. Everything that used
 * to live in the export bar's handler is here, and the export bar now calls it.
 *
 * Deliberately knows nothing about PDFs, files or the store.
 */
export interface JobInput {
  template: Template;
  card: CardSpec;
  sheet: SheetSpec;
  rows: GuestRow[];
  headers: string[];
  rowIds?: string[];
  resolve: ResolveOptions;
  /** Printer calibration, 1 when uncalibrated. */
  scale?: number;
  duplex?: { flipEdge: FlipEdge; backOffsetXMm?: number; backOffsetYMm?: number };
  /** Build only this page range of the FRONT sheets. */
  pages?: { from: number; to: number };
  /** Limit to the first N artefacts — the two-test-cards path. */
  limit?: number;
}

export interface JobResult {
  sheets: Sheet[];
  warnings: GuestWarning[];
  artefactCount: number;
  /** One line per sheet, in sheet order. The caller decides whether to draw them. */
  slugTexts: string[];
  slugRuleMm: number;
  buildHash: string;
}

export function buildJob(input: JobInput): JobResult {
  const all = buildArtefacts(
    input.rows,
    input.template.rowScope ?? { kind: "per-row" },
    input.headers,
    input.rowIds,
  );
  const artefacts = input.limit === undefined ? all : all.slice(0, input.limit);
  const pageRange = input.pages ? { pages: input.pages } : {};
  const scale = effectiveScale(input.scale);

  const front = paginate(
    templateForSide(input.template, "front"),
    artefacts,
    input.card,
    input.sheet,
    input.resolve,
    pageRange,
  );

  let sheets = front.sheets;
  const wantsDuplex = input.sheet.duplex && hasBackSide(input.template) && input.duplex;
  if (wantsDuplex && input.duplex) {
    const axis = mirrorAxisFor(
      input.duplex.flipEdge,
      front.sheets[0]?.pageWidthMm ?? 0,
      front.sheets[0]?.pageHeightMm ?? 0,
    );
    const backs = paginate(
      templateForSide(input.template, "back"),
      artefacts,
      input.card,
      input.sheet,
      input.resolve,
      pageRange,
    ).sheets.map((s) =>
      offsetSheet(
        mirrorSheet(s, axis),
        input.duplex?.backOffsetXMm ?? 0,
        input.duplex?.backOffsetYMm ?? 0,
      ),
    );
    sheets = interleave(front.sheets, backs);
  }

  const buildHash = buildFingerprint({
    card: input.card,
    sheet: input.sheet,
    template: input.template,
    rowCount: artefacts.length,
    scale,
  });

  const slugTexts: string[] = [];
  for (const s of sheets) {
    slugTexts[s.index] = slugText({
      card: input.card,
      sheet: input.sheet,
      rowCount: artefacts.length,
      scale,
      buildHash,
      sheetIndex: s.index,
      sheetCount: sheets.length,
    });
  }

  return {
    sheets,
    warnings: front.warnings,
    artefactCount: artefacts.length,
    slugTexts,
    slugRuleMm: SLUG_RULE_MM,
    buildHash,
  };
}
