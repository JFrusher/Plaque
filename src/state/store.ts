import { create } from "zustand";
import { DEFAULT_FONT_ID } from "../assets/fonts";
import type { CsvIssue, GuestRow } from "../core/csv/parse";
import { defaultRowIds } from "../core/data/artefacts";
import { defaultFoldPosition } from "../core/geometry/fold";
import { sideOf } from "../core/imposition/duplex";
import type { LayoutSuggestion } from "../core/geometry/suggestLayouts";
import { defaultCard, defaultSheet, defaultTemplate, newId } from "../core/template/defaults";
import {
  withOverride,
  withoutOverride,
  type ElementPatch,
} from "../core/template/overrides";
import { rebindTemplate } from "../core/template/rebind";
import { elementKind } from "../core/template/registry";
import type { GalleryTemplate } from "../core/data/gallery";

/**
 * The columns the shipped gallery is written against. Rebinding maps them onto
 * whatever the loaded CSV calls the same roles.
 */
const SAMPLE_HEADERS = ["First Name", "Last Name", "Table", "Dietary"];
import type {
  CardElement,
  CardSide,
  CardSpec,
  ElementId,
  Rect,
  ResolvedImageSource,
  RowScope,
  SheetSpec,
  Template,
} from "../core/types";
import type { LoadedFont } from "../core/text/measure";
import type { PrinterProfile } from "../core/print/printerProfile";
import { pushHistory, snapshot, type Snapshot } from "./history";

/** Every kind the registry knows about — see core/template/registry. */
export type NewElementKind = CardElement["kind"];

export interface PlaqueState extends Snapshot {
  // Guest data
  headers: string[];
  rows: GuestRow[];
  /**
   * One id per row, in the same order. Identity has to live somewhere for
   * per-row overrides and for combine/split to be reversible, and a GuestRow is
   * deliberately just the user's own columns.
   */
  rowIds: string[];
  /**
   * Rows that were combined onto one artefact, keyed by the synthetic row's id
   * (S-I.3). The originals are kept whole, not just their ids, because "split it
   * again restores the originals exactly" is the acceptance criterion.
   */
  merged: Record<string, { indexes: number[]; ids: string[]; rows: GuestRow[] }>;
  csvIssues: CsvIssue[];
  fileName: string | null;

  /**
   * Parsed faces, keyed by fontId — bundled and uploaded alike. Held in the
   * store rather than a context so every panel and both renderers read fonts
   * the same way. Never persisted: the binaries live in IndexedDB.
   */
  fonts: Map<string, LoadedFont>;
  fontLabels: Record<string, string>;

  /** Uploaded images, keyed by imageId. Binaries live in IndexedDB. */
  images: Map<string, ResolvedImageSource>;
  imageNames: Record<string, string>;

  // User-supplied assets, kept out of the autosave payload — see blobStore.
  uploadedIcons: Record<string, string>;
  uploadedFontIds: string[];

  /**
   * Original filename for every uploaded asset, by id. Persisted, unlike the
   * binaries, so a design whose blob has gone can still say "crest.png is
   * missing" rather than naming a hash (S-D1.4).
   */
  assetNames: Record<string, string>;

  /**
   * Per-device printer calibration (S-D2.1). Kept in the store so the export bar
   * and the print setup panel cannot disagree about which factor applies.
   * Persisted to IndexedDB by printerStore, never into a project file.
   */
  printers: PrinterProfile[];
  activePrinterId: string | null;

  // UI
  /**
   * Which side of the card the editor is showing. New elements are stamped with
   * it, so the two sides come out of one element list — see core/imposition/duplex.
   */
  editingSide: CardSide;
  selectedId: ElementId | null;
  /**
   * The image element whose crop is being dragged on the canvas, if any.
   * Transient by design: it is a pointer mode, not part of the design, so it is
   * neither persisted nor snapshotted for undo.
   */
  cropId: ElementId | null;
  page: number;
  snapEnabled: boolean;
  /** Collapses the sheet pane, giving the card the whole workspace. */
  sheetCollapsed: boolean;
  previewGuestIndex: number;

  past: Snapshot[];
  future: Snapshot[];

  setCsv: (data: { headers: string[]; rows: GuestRow[]; issues: CsvIssue[]; fileName: string }) => void;
  setCard: (patch: Partial<CardSpec>) => void;
  setSheet: (patch: Partial<SheetSpec>) => void;
  applySuggestion: (s: LayoutSuggestion) => void;
  setBackground: (hex: string | null) => void;
  /** Changing scope changes how many artefacts exist, so pagination resets. */
  setRowScope: (scope: RowScope) => void;
  /** Applies a gallery design over the current data, rebinding its tokens (F2). */
  applyGalleryTemplate: (entry: GalleryTemplate) => void;

  /** S-I.3 — two guests on one card. Reversible by `splitRow`. */
  combineRows: (indexes: number[]) => void;
  splitRow: (rowId: string) => void;
  /** Design patch for one row only (D1). Passing `null` clears it. */
  overrideForRow: (rowId: string, elementId: ElementId, patch: ElementPatch | null) => void;

  addElement: (kind: NewElementKind) => void;
  updateElement: (id: ElementId, patch: Partial<CardElement>) => void;
  /** Records one undo entry, then leaves the caller free to make many small changes. */
  beginEdit: () => void;
  /** Live drag updates. Deliberately does NOT touch history. */
  setElementBox: (id: ElementId, box: Rect) => void;
  /**
   * Pans or zooms the artwork inside an image element. Like `setElementBox`,
   * it records no history of its own: the canvas calls `beginEdit` once as the
   * gesture starts, so one crop is one undo entry rather than sixty.
   */
  setElementCrop: (id: ElementId, patch: { zoom?: number; focusX?: number; focusY?: number }) => void;
  removeElement: (id: ElementId) => void;
  duplicateElement: (id: ElementId) => void;
  /** Replaces the back with a copy of the front, for cards read from either side. */
  copyFrontToBack: () => void;
  raiseElement: (id: ElementId) => void;
  lowerElement: (id: ElementId) => void;

  setImages: (images: Map<string, ResolvedImageSource>, names: Record<string, string>) => void;
  addImage: (source: ResolvedImageSource, name: string) => void;
  removeImage: (id: string) => void;

  setFonts: (fonts: Map<string, LoadedFont>, labels: Record<string, string>) => void;
  addFont: (font: LoadedFont, label: string, fileName?: string) => void;
  removeFont: (id: string) => void;
  /** Records what an asset id was called, even when the asset itself failed to load. */
  noteAssetName: (id: string, name: string) => void;
  addUploadedIcon: (id: string, pathD: string) => void;
  removeUploadedIcon: (id: string) => void;

  setPrinters: (printers: PrinterProfile[], activeId: string | null) => void;
  /** Adds or replaces one profile by id, and makes it the active printer. */
  upsertPrinter: (profile: PrinterProfile) => void;
  removePrinter: (id: string) => void;
  setActivePrinter: (id: string | null) => void;

  setEditingSide: (side: CardSide) => void;
  select: (id: ElementId | null) => void;
  /** Enters or leaves crop mode. Leaving is `null`. */
  setCropId: (id: ElementId | null) => void;
  setPage: (page: number) => void;
  setPreviewGuestIndex: (index: number) => void;
  toggleSnap: () => void;
  toggleSheetCollapsed: () => void;

  undo: () => void;
  redo: () => void;
  clearAll: () => void;
  hydrate: (patch: Partial<PlaqueState>) => void;
}

/**
 * The starting design has an EMPTY template on purpose. Building a default
 * template before any CSV exists would produce elements bound to columns that
 * do not exist, and would then block `setCsv` from laying out a real one.
 */
function initial(): Snapshot {
  return {
    card: defaultCard(),
    sheet: defaultSheet(),
    template: { elements: [], backgroundHex: null },
  };
}

export const usePlaque = create<PlaqueState>()((set) => {
  /** Records the design as it stands, then applies the change. */
  const commit = (mutate: (s: PlaqueState) => Partial<PlaqueState>) => {
    set((s) => ({
      past: pushHistory(s.past, snapshot(s)),
      future: [],
      ...mutate(s),
    }));
  };

  const replaceElement = (s: PlaqueState, id: ElementId, patch: Partial<CardElement>): Template => ({
    ...s.template,
    elements: s.template.elements.map((el) =>
      el.id === id ? ({ ...el, ...patch } as CardElement) : el,
    ),
  });

  return {
    ...initial(),
    headers: [],
    rows: [],
    rowIds: [],
    merged: {},
    csvIssues: [],
    fileName: null,
    fonts: new Map(),
    fontLabels: {},
    images: new Map(),
    imageNames: {},
    uploadedIcons: {},
    uploadedFontIds: [],
    assetNames: {},
    printers: [],
    activePrinterId: null,
    editingSide: "front",
    selectedId: null,
    cropId: null,
    page: 0,
    snapEnabled: true,
    sheetCollapsed: false,
    previewGuestIndex: 0,
    past: [],
    future: [],

    setCsv: ({ headers, rows, issues, fileName }) =>
      commit((s) => ({
        headers,
        rows,
        // A new file is a new dataset: old ids, and the combines built on them,
        // do not carry over.
        rowIds: defaultRowIds(rows.length),
        merged: {},
        csvIssues: issues,
        fileName,
        page: 0,
        previewGuestIndex: 0,
        // A blank template means this is the first upload; give the user a card
        // that already renders their data rather than an empty rectangle.
        // Otherwise the existing design is re-attached by column ROLE, so a
        // template survives next year's export with different header names
        // (S-B.1). Tokens that cannot be matched are left alone and reported.
        template:
          s.template.elements.length === 0
            ? defaultTemplate(headers, s.card)
            : rebindTemplate(s.template, s.headers, headers).template,
      })),

    setCard: (patch) =>
      commit((s) => {
        const card = { ...s.card, ...patch };
        // Changing the fold axis makes the old fold position meaningless.
        if (patch.fold && patch.fold !== s.card.fold) {
          card.foldPositionMm = defaultFoldPosition(card);
        }
        return { card };
      }),

    setSheet: (patch) => commit((s) => ({ sheet: { ...s.sheet, ...patch }, page: 0 })),

    applySuggestion: (suggestion) =>
      commit((s) => ({ sheet: { ...s.sheet, ...suggestion.patch }, page: 0 })),

    setBackground: (hex) => commit((s) => ({ template: { ...s.template, backgroundHex: hex } })),

    applyGalleryTemplate: (entry) =>
      commit((s) => ({
        card: { ...s.card, ...entry.card },
        // The gallery is written against the sample column names; rebinding
        // re-attaches it to whatever this CSV calls them (S-B.1).
        template: rebindTemplate(
          { ...entry.template, overrides: {} },
          SAMPLE_HEADERS,
          s.headers,
        ).template,
        selectedId: null,
        page: 0,
        previewGuestIndex: 0,
      })),

    setRowScope: (rowScope) =>
      commit((s) => ({
        template: { ...s.template, rowScope },
        page: 0,
        previewGuestIndex: 0,
      })),

    // Combine and split change the DATA, not the design, so they stay out of
    // undo history for the same reason a CSV upload does — and putting 2000 rows
    // into each of fifty snapshots would be its own kind of data loss. They are
    // each other's exact inverse, which is the recovery path.
    combineRows: (indexes) =>
      set((s) => {
        const picked = [...new Set(indexes)].sort((a, b) => a - b);
        const rows = picked.map((i) => s.rows[i]).filter((r): r is GuestRow => Boolean(r));
        if (rows.length < 2) return {};

        const at = picked[0]!;
        const id = `merged:${newId()}`;
        const combined: GuestRow = {};
        for (const header of s.headers) {
          // Distinct values joined, in order: "Ada & Grace" for the names,
          // "Table 4" once for the table they share.
          const values = [...new Set(rows.map((r) => r[header]).filter(Boolean))];
          combined[header] = values.join(" & ");
        }

        const keep = new Set(picked);
        return {
          rows: [
            ...s.rows.slice(0, at).filter((_, i) => !keep.has(i)),
            combined,
            ...s.rows.slice(at + 1).filter((_, i) => !keep.has(at + 1 + i)),
          ],
          rowIds: [
            ...s.rowIds.slice(0, at).filter((_, i) => !keep.has(i)),
            id,
            ...s.rowIds.slice(at + 1).filter((_, i) => !keep.has(at + 1 + i)),
          ],
          merged: {
            ...s.merged,
            // Positions, not just ids: "splitting restores the originals
            // exactly" includes putting them back where they were.
            [id]: { indexes: picked, ids: picked.map((i) => s.rowIds[i] ?? `r${i}`), rows },
          },
          previewGuestIndex: 0,
          page: 0,
        };
      }),

    splitRow: (rowId) =>
      set((s) => {
        const record = s.merged[rowId];
        const at = s.rowIds.indexOf(rowId);
        if (!record || at === -1) return {};
        const { [rowId]: _dropped, ...merged } = s.merged;

        // Drop the synthetic row, then put each source back at the index it
        // came from. Ascending order makes each insertion land correctly; the
        // clamp covers a list that has since been edited elsewhere.
        const rows = [...s.rows.slice(0, at), ...s.rows.slice(at + 1)];
        const rowIds = [...s.rowIds.slice(0, at), ...s.rowIds.slice(at + 1)];
        for (const [i, index] of record.indexes.entries()) {
          const target = Math.min(index, rows.length);
          rows.splice(target, 0, record.rows[i]!);
          rowIds.splice(target, 0, record.ids[i]!);
        }

        return { rows, rowIds, merged, previewGuestIndex: 0, page: 0 };
      }),

    overrideForRow: (rowId, elementId, patch) =>
      commit((s) => ({
        template: {
          ...s.template,
          overrides: patch
            ? withOverride(s.template.overrides, rowId, elementId, patch)
            : withoutOverride(s.template.overrides, rowId, elementId),
        },
      })),

    addElement: (kind) =>
      commit((s) => {
        const el = { ...makeElement(kind, s.card, s.headers, nextZ(s.template)), side: s.editingSide };
        return {
          template: { ...s.template, elements: [...s.template.elements, el] },
          selectedId: el.id,
        };
      }),

    updateElement: (id, patch) => commit((s) => ({ template: replaceElement(s, id, patch) })),

    beginEdit: () => set((s) => ({ past: pushHistory(s.past, snapshot(s)), future: [] })),

    setElementBox: (id, box) =>
      set((s) => ({
        template: {
          ...s.template,
          elements: s.template.elements.map((el) =>
            el.id === id ? { ...el, x: box.x, y: box.y, w: box.w, h: box.h } : el,
          ),
        },
      })),

    setElementCrop: (id, patch) =>
      set((s) => ({ template: replaceElement(s, id, patch as Partial<CardElement>) })),

    removeElement: (id) =>
      commit((s) => ({
        template: { ...s.template, elements: s.template.elements.filter((el) => el.id !== id) },
        selectedId: s.selectedId === id ? null : s.selectedId,
      })),

    duplicateElement: (id) =>
      commit((s) => {
        const source = s.template.elements.find((el) => el.id === id);
        if (!source) return {};
        const copy = { ...source, id: newId(), x: source.x + 3, y: source.y + 3, z: nextZ(s.template) };
        return {
          template: { ...s.template, elements: [...s.template.elements, copy] },
          selectedId: copy.id,
        };
      }),

    /**
     * A flat place card that has to be readable from both seats: the back is
     * the same design, not a mirror of it.
     *
     * Card-relative coordinates are copied verbatim on purpose. The back sheet
     * is mirrored by SLOT in core/imposition/duplex, so a back element at the
     * same card coordinates lands exactly behind its front twin — and then
     * takes the printer's registration correction with it.
     *
     * One-shot, and re-runnable: the back is replaced outright, so changing the
     * front and pressing again re-syncs it. Per-row overrides are copied across
     * to the new ids, or the back would print the raw CSV value where the front
     * prints an edited one.
     */
    copyFrontToBack: () =>
      commit((s) => {
        const fronts = s.template.elements.filter((el) => sideOf(el) === "front");
        if (fronts.length === 0) return {};

        const copyIdFor = new Map(fronts.map((el) => [el.id, newId()]));
        const backs = fronts.map((el) => ({ ...el, id: copyIdFor.get(el.id)!, side: "back" as const }));

        const overrides = Object.fromEntries(
          Object.entries(s.template.overrides ?? {}).map(([rowId, byElement]) => [
            rowId,
            // Only front ids survive, so this also sweeps up patches left behind
            // by the back elements this replaces.
            Object.fromEntries(
              Object.entries(byElement).flatMap(([elementId, patch]) => {
                const copyId = copyIdFor.get(elementId);
                return copyId ? [[elementId, patch], [copyId, patch]] : [];
              }),
            ),
          ]),
        );

        return {
          template: { ...s.template, elements: [...fronts, ...backs], overrides },
          // The copy is pointless unless the sheet actually prints two sides.
          sheet: { ...s.sheet, duplex: true },
          editingSide: "back",
          selectedId: null,
        };
      }),

    raiseElement: (id) =>
      commit((s) => ({ template: replaceElement(s, id, { z: nextZ(s.template) }) })),

    lowerElement: (id) =>
      commit((s) => ({
        template: replaceElement(s, id, {
          z: Math.min(0, ...s.template.elements.map((el) => el.z)) - 1,
        }),
      })),

    setImages: (images, imageNames) =>
      set((s) => {
        // Every object URL that is not carried over leaks its blob otherwise,
        // and in development React runs the loading effect twice.
        for (const [id, source] of s.images) {
          if (images.get(id) !== source) URL.revokeObjectURL(source.url);
        }
        return { images, imageNames };
      }),

    addImage: (source, name) =>
      set((s) => ({
        images: new Map(s.images).set(source.id, source),
        imageNames: { ...s.imageNames, [source.id]: name },
        assetNames: { ...s.assetNames, [source.id]: name },
      })),

    removeImage: (id) =>
      set((s) => {
        const images = new Map(s.images);
        const dropped = images.get(id);
        if (dropped) URL.revokeObjectURL(dropped.url);
        images.delete(id);
        const { [id]: _dropped, ...imageNames } = s.imageNames;
        // Deliberate removal is not a missing asset: forget the name too, and
        // the elements below stop pointing at it.
        const { [id]: _droppedName, ...assetNames } = s.assetNames;
        // Elements pointing at it fall back to empty rather than to a stale id.
        return {
          images,
          imageNames,
          assetNames,
          template: {
            ...s.template,
            elements: s.template.elements.map((el) =>
              el.kind === "image" && el.imageId === id ? { ...el, imageId: null } : el,
            ),
          },
        };
      }),

    setFonts: (fonts, fontLabels) => set({ fonts, fontLabels }),

    addFont: (font, label, fileName) =>
      set((s) => ({
        fonts: new Map(s.fonts).set(font.id, font),
        fontLabels: { ...s.fontLabels, [font.id]: label },
        assetNames: { ...s.assetNames, [font.id]: fileName ?? label },
        uploadedFontIds: s.uploadedFontIds.includes(font.id)
          ? s.uploadedFontIds
          : [...s.uploadedFontIds, font.id],
      })),

    removeFont: (id) =>
      set((s) => {
        const fonts = new Map(s.fonts);
        fonts.delete(id);
        const { [id]: _dropped, ...fontLabels } = s.fontLabels;
        const { [id]: _droppedName, ...assetNames } = s.assetNames;
        // Any element still pointing at the removed face falls back to a
        // bundled one, so nothing silently renders as nothing.
        return {
          fonts,
          fontLabels,
          assetNames,
          uploadedFontIds: s.uploadedFontIds.filter((existing) => existing !== id),
          template: {
            ...s.template,
            elements: s.template.elements.map((el) =>
              (el.kind === "text" || el.kind === "list") && el.fontId === id
                ? { ...el, fontId: DEFAULT_FONT_ID }
                : el,
            ),
          },
        };
      }),

    noteAssetName: (id, name) => set((s) => ({ assetNames: { ...s.assetNames, [id]: name } })),

    addUploadedIcon: (id, pathD) =>
      set((s) => ({ uploadedIcons: { ...s.uploadedIcons, [id]: pathD } })),

    removeUploadedIcon: (id) =>
      set((s) => {
        const { [id]: _dropped, ...uploadedIcons } = s.uploadedIcons;
        return { uploadedIcons };
      }),

    // Switching sides clears the selection: the selected element is no longer on
    // screen, and leaving it selected makes the inspector edit an invisible box.
    setEditingSide: (editingSide) => set({ editingSide, selectedId: null }),

    setPrinters: (printers, activePrinterId) => set({ printers, activePrinterId }),

    upsertPrinter: (profile) =>
      set((s) => ({
        printers: s.printers.some((p) => p.id === profile.id)
          ? s.printers.map((p) => (p.id === profile.id ? profile : p))
          : [...s.printers, profile],
        activePrinterId: profile.id,
      })),

    removePrinter: (id) =>
      set((s) => ({
        printers: s.printers.filter((p) => p.id !== id),
        activePrinterId: s.activePrinterId === id ? null : s.activePrinterId,
      })),

    setActivePrinter: (activePrinterId) => set({ activePrinterId }),

    // Selecting something else leaves crop mode: a crop drag belongs to the
    // element that was being cropped, and nothing else.
    select: (selectedId) => set((s) => ({ selectedId, cropId: s.cropId === selectedId ? s.cropId : null })),
    setCropId: (cropId) => set({ cropId }),
    setPage: (page) => set({ page }),
    setPreviewGuestIndex: (previewGuestIndex) => set({ previewGuestIndex }),
    toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),
    toggleSheetCollapsed: () => set((s) => ({ sheetCollapsed: !s.sheetCollapsed })),

    undo: () =>
      set((s) => {
        const previous = s.past.at(-1);
        if (!previous) return {};
        return {
          past: s.past.slice(0, -1),
          future: [snapshot(s), ...s.future].slice(0, 50),
          ...previous,
          selectedId: previous.template.elements.some((el) => el.id === s.selectedId)
            ? s.selectedId
            : null,
        };
      }),

    redo: () =>
      set((s) => {
        const [next, ...rest] = s.future;
        if (!next) return {};
        return {
          past: pushHistory(s.past, snapshot(s)),
          future: rest,
          ...next,
          selectedId: next.template.elements.some((el) => el.id === s.selectedId)
            ? s.selectedId
            : null,
        };
      }),

    clearAll: () =>
      set({
        ...initial(),
        headers: [],
        rows: [],
        rowIds: [],
        merged: {},
        csvIssues: [],
        fileName: null,
        uploadedIcons: {},
        uploadedFontIds: [],
        assetNames: {},
        editingSide: "front",
        // Bundled faces stay loaded; only uploaded ones are the user's data,
        // and those are removed from the map by the caller after clearing IDB.
        selectedId: null,
        page: 0,
        previewGuestIndex: 0,
        past: [],
        future: [],
      }),

    hydrate: (patch) => set(patch),
  };
});

function nextZ(template: Template): number {
  return Math.max(0, ...template.elements.map((el) => el.z)) + 1;
}

/** A new element lands in the middle of the card, sized for its kind. */
function makeElement(
  kind: NewElementKind,
  card: CardSpec,
  headers: string[],
  z: number,
): CardElement {
  const spec = elementKind(kind);
  if (!spec) throw new Error(`Unknown element kind: ${kind}`);
  return spec.create({ id: newId(), z, card, headers });
}
