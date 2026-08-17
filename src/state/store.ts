import { create } from "zustand";
import { DEFAULT_FONT_ID } from "../assets/fonts";
import type { CsvIssue, GuestRow } from "../core/csv/parse";
import { defaultFoldPosition } from "../core/geometry/fold";
import type { LayoutSuggestion } from "../core/geometry/suggestLayouts";
import {
  defaultCard,
  defaultIconRules,
  defaultSheet,
  defaultTemplate,
  newId,
} from "../core/template/defaults";
import { DEFAULT_FIT } from "../core/text/fit";
import type {
  CardElement,
  CardSpec,
  ElementId,
  Rect,
  ResolvedImageSource,
  SheetSpec,
  Template,
} from "../core/types";
import type { LoadedFont } from "../core/text/measure";
import { pushHistory, snapshot, type Snapshot } from "./history";

export type NewElementKind = "text" | "icon" | "rect" | "line" | "image";

export interface PlaqueState extends Snapshot {
  // Guest data
  headers: string[];
  rows: GuestRow[];
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

  // User-supplied assets, kept out of localStorage — see blobStore.
  uploadedIcons: Record<string, string>;
  uploadedFontIds: string[];

  // UI
  selectedId: ElementId | null;
  page: number;
  snapEnabled: boolean;
  previewGuestIndex: number;

  past: Snapshot[];
  future: Snapshot[];

  setCsv: (data: { headers: string[]; rows: GuestRow[]; issues: CsvIssue[]; fileName: string }) => void;
  setCard: (patch: Partial<CardSpec>) => void;
  setSheet: (patch: Partial<SheetSpec>) => void;
  applySuggestion: (s: LayoutSuggestion) => void;
  setBackground: (hex: string | null) => void;

  addElement: (kind: NewElementKind) => void;
  updateElement: (id: ElementId, patch: Partial<CardElement>) => void;
  /** Records one undo entry, then leaves the caller free to make many small changes. */
  beginEdit: () => void;
  /** Live drag updates. Deliberately does NOT touch history. */
  setElementBox: (id: ElementId, box: Rect) => void;
  removeElement: (id: ElementId) => void;
  duplicateElement: (id: ElementId) => void;
  raiseElement: (id: ElementId) => void;
  lowerElement: (id: ElementId) => void;

  setImages: (images: Map<string, ResolvedImageSource>, names: Record<string, string>) => void;
  addImage: (source: ResolvedImageSource, name: string) => void;
  removeImage: (id: string) => void;

  setFonts: (fonts: Map<string, LoadedFont>, labels: Record<string, string>) => void;
  addFont: (font: LoadedFont, label: string) => void;
  removeFont: (id: string) => void;
  addUploadedIcon: (id: string, pathD: string) => void;
  removeUploadedIcon: (id: string) => void;

  select: (id: ElementId | null) => void;
  setPage: (page: number) => void;
  setPreviewGuestIndex: (index: number) => void;
  toggleSnap: () => void;

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
    csvIssues: [],
    fileName: null,
    fonts: new Map(),
    fontLabels: {},
    images: new Map(),
    imageNames: {},
    uploadedIcons: {},
    uploadedFontIds: [],
    selectedId: null,
    page: 0,
    snapEnabled: true,
    previewGuestIndex: 0,
    past: [],
    future: [],

    setCsv: ({ headers, rows, issues, fileName }) =>
      commit((s) => ({
        headers,
        rows,
        csvIssues: issues,
        fileName,
        page: 0,
        previewGuestIndex: 0,
        // A blank template means this is the first upload; give the user a card
        // that already renders their data rather than an empty rectangle.
        template: s.template.elements.length === 0 ? defaultTemplate(headers, s.card) : s.template,
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

    addElement: (kind) =>
      commit((s) => {
        const el = makeElement(kind, s.card, s.headers, nextZ(s.template));
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
      })),

    removeImage: (id) =>
      set((s) => {
        const images = new Map(s.images);
        const dropped = images.get(id);
        if (dropped) URL.revokeObjectURL(dropped.url);
        images.delete(id);
        const { [id]: _dropped, ...imageNames } = s.imageNames;
        // Elements pointing at it fall back to empty rather than to a stale id.
        return {
          images,
          imageNames,
          template: {
            ...s.template,
            elements: s.template.elements.map((el) =>
              el.kind === "image" && el.imageId === id ? { ...el, imageId: null } : el,
            ),
          },
        };
      }),

    setFonts: (fonts, fontLabels) => set({ fonts, fontLabels }),

    addFont: (font, label) =>
      set((s) => ({
        fonts: new Map(s.fonts).set(font.id, font),
        fontLabels: { ...s.fontLabels, [font.id]: label },
        uploadedFontIds: s.uploadedFontIds.includes(font.id)
          ? s.uploadedFontIds
          : [...s.uploadedFontIds, font.id],
      })),

    removeFont: (id) =>
      set((s) => {
        const fonts = new Map(s.fonts);
        fonts.delete(id);
        const { [id]: _dropped, ...fontLabels } = s.fontLabels;
        // Any element still pointing at the removed face falls back to a
        // bundled one, so nothing silently renders as nothing.
        return {
          fonts,
          fontLabels,
          uploadedFontIds: s.uploadedFontIds.filter((existing) => existing !== id),
          template: {
            ...s.template,
            elements: s.template.elements.map((el) =>
              el.kind === "text" && el.fontId === id ? { ...el, fontId: DEFAULT_FONT_ID } : el,
            ),
          },
        };
      }),

    addUploadedIcon: (id, pathD) =>
      set((s) => ({ uploadedIcons: { ...s.uploadedIcons, [id]: pathD } })),

    removeUploadedIcon: (id) =>
      set((s) => {
        const { [id]: _dropped, ...uploadedIcons } = s.uploadedIcons;
        return { uploadedIcons };
      }),

    select: (selectedId) => set({ selectedId }),
    setPage: (page) => set({ page }),
    setPreviewGuestIndex: (previewGuestIndex) => set({ previewGuestIndex }),
    toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),

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
        csvIssues: [],
        fileName: null,
        uploadedIcons: {},
        uploadedFontIds: [],
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
  const base = { id: newId(), z };
  const cx = card.widthMm / 2;
  const cy = card.heightMm / 2;

  switch (kind) {
    case "text":
      return {
        ...base,
        kind: "text",
        x: cx - 25,
        y: cy - 6,
        w: 50,
        h: 12,
        template: headers[0] ? `{{${headers[0]}}}` : "Text",
        fontId: DEFAULT_FONT_ID,
        fontSizePt: 14,
        align: "center",
        vAlign: "middle",
        lineHeight: 1.2,
        colorHex: "#171613",
        letterSpacingMm: 0,
        fit: { ...DEFAULT_FIT },
      };
    case "icon":
      return {
        ...base,
        kind: "icon",
        x: cx - 4,
        y: cy - 4,
        w: 8,
        h: 8,
        sourceField: headers[0] ?? "",
        rules: defaultIconRules(),
        fallbackIconId: null,
        colorHex: "#46443f",
      };
    case "rect":
      return {
        ...base,
        kind: "rect",
        x: cx - 20,
        y: cy - 12,
        w: 40,
        h: 24,
        fillHex: null,
        strokeHex: "#46443f",
        strokeWidthMm: 0.3,
        dashed: false,
      };
    case "image":
      return {
        ...base,
        kind: "image",
        x: cx - 12,
        y: cy - 12,
        w: 24,
        h: 24,
        imageId: null,
        fit: "contain",
        opacity: 1,
      };
    case "line":
      return {
        ...base,
        kind: "line",
        x: cx - 15,
        y: cy - 1,
        w: 30,
        h: 2,
        strokeHex: "#46443f",
        strokeWidthMm: 0.3,
        dashed: false,
      };
  }
}
