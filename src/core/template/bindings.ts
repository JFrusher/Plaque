import type {
  CardScene,
  CardSpec,
  ElementId,
  ListElement,
  Pt,
  ResolvedElement,
  ResolvedImageSource,
  Template,
  TextElement,
} from "../types";
import { BUNDLED_VIEW, type IconArt } from "../../assets/icons";
import type { GuestRow } from "../csv/parse";
import { interpolate } from "../csv/interpolate";
import { transformForPanel } from "../geometry/fold";
import { resolveIconForRow } from "./icons";

export interface FitResult {
  lines: string[];
  fontSizePt: Pt;
  overflowed: boolean;
  /**
   * Set when the face was not available, so no real fitting decision was made.
   * The size below is the requested one, not a measured one.
   */
  missingFont?: boolean;
}

/** Injected so bindings stays pure and testable without loading a font. */
export type FitTextFn = (element: TextElement, text: string) => FitResult;
/** Block fit for a list element: the lines are already decided, only the size is not. */
export type FitBlockFn = (element: ListElement, lines: string[]) => FitResult;
export type IconPathFn = (iconId: string) => IconArt | null;
export type ImageFn = (imageId: string) => ResolvedImageSource | null;

export interface ResolveOptions {
  fitText: FitTextFn;
  /** Without it a list element renders nothing and says so. */
  fitBlock?: FitBlockFn;
  iconPath: IconPathFn;
  /** Optional: without it, image elements resolve to nothing and warn. */
  image?: ImageFn;
  /**
   * Characters of `text` the element's face cannot draw, with a face that can
   * (E2). Injected so bindings stays free of fontkit.
   */
  missingGlyphs?: (fontId: string, text: string) => { missing: string[]; fallback: string | null };
  /**
   * Original filename for an uploaded asset id. Without it a missing asset can
   * only be named by its content hash, which tells the user nothing about which
   * file to go and find (S-D1.4).
   */
  assetName?: (id: string) => string | null;
}

export type WarningKind =
  | "overflow"
  | "missing-field"
  | "missing-glyph"
  | "missing-icon"
  | "missing-image"
  | "missing-font"
  | "unknown-element"
  | "empty-text";

export interface CardWarning {
  elementId: ElementId;
  kind: WarningKind;
  detail: string;
}

export interface ResolvedCard {
  /** Card-local coordinates. `paginate` maps these onto a sheet. */
  scene: CardScene;
  warnings: CardWarning[];
}

/**
 * Turns the template plus one guest row into a renderable card.
 *
 * Fold inversion is applied here, not in a renderer: by the time an element
 * leaves this function it carries a final box and a rotation, and neither
 * renderer needs to know that folding exists.
 */
export function resolveCard(
  template: Template,
  row: GuestRow,
  card: CardSpec,
  opts: ResolveOptions,
  /**
   * Every row this artefact covers. A list element repeats over these; every
   * other element ignores them and binds to `row` as it always has. Defaults to
   * the single row, so per-row scope is unchanged.
   */
  rows: GuestRow[] = [row],
): ResolvedCard {
  const warnings: CardWarning[] = [];
  const elements: ResolvedElement[] = [];

  for (const el of [...template.elements].sort((a, b) => a.z - b.z)) {
    const placed = transformForPanel({ x: el.x, y: el.y, w: el.w, h: el.h }, card);
    const base = {
      id: el.id,
      x: placed.box.x,
      y: placed.box.y,
      w: placed.box.w,
      h: placed.box.h,
      rotationDeg: placed.rotationDeg,
      z: el.z,
    };

    switch (el.kind) {
      case "text": {
        const { text, missing } = interpolate(el.template, row);
        for (const name of missing) {
          warnings.push({
            elementId: el.id,
            kind: "missing-field",
            detail: `No column named "${name}".`,
          });
        }
        const fit = opts.fitText(el, text);
        if (fit.missingFont) {
          // Blocking, not cosmetic: without metrics the size and the line breaks
          // are guesses, so the preview and the print would disagree.
          warnings.push({
            elementId: el.id,
            kind: "missing-font",
            detail: `The font "${assetLabel(opts, el.fontId)}" is not on this device, so this text cannot be sized correctly.`,
          });
        }
        if (fit.overflowed) {
          warnings.push({
            elementId: el.id,
            kind: "overflow",
            detail: `"${text}" does not fit at ${el.fit.minFontSizePt}pt.`,
          });
        }
        if (text.length === 0) {
          warnings.push({ elementId: el.id, kind: "empty-text", detail: "Resolves to nothing." });
        }
        // Tofu on a printed card is unrecoverable, so it is found per row —
        // one guest in a hundred and fifty is exactly the case that slips past.
        const glyphs = opts.missingGlyphs?.(el.fontId, text);
        if (glyphs && glyphs.missing.length > 0) {
          warnings.push({
            elementId: el.id,
            kind: "missing-glyph",
            detail: `"${text}" uses ${glyphs.missing.map((c) => `"${c}"`).join(", ")}, which this font cannot print.${
              glyphs.fallback ? ` ${glyphs.fallback} can.` : " No loaded font can."
            }`,
          });
        }
        elements.push({
          ...base,
          kind: "text",
          lines: fit.lines,
          fontId: el.fontId,
          fontSizePt: fit.fontSizePt,
          align: el.align,
          vAlign: el.vAlign,
          anchor: el.fit.anchor,
          lineHeight: el.lineHeight,
          colorHex: el.colorHex,
          letterSpacingMm: el.letterSpacingMm,
          overflowed: fit.overflowed,
          ...(el.optical ? { optical: el.optical } : {}),
        });
        break;
      }

      case "icon": {
        const iconId = resolveIconForRow(row, el.sourceField, el.rules, el.fallbackIconId);
        const art = iconId ? opts.iconPath(iconId) : null;
        if (iconId && art === null) {
          warnings.push({
            elementId: el.id,
            kind: "missing-icon",
            detail: `Icon "${iconId}" is not loaded.`,
          });
        }
        elements.push({
          ...base,
          kind: "icon",
          pathD: art?.d ?? null,
          cutD: art?.cut ?? null,
          view: art?.view ?? BUNDLED_VIEW,
          colorHex: el.colorHex,
          cutHex: template.backgroundHex ?? "#ffffff",
        });
        break;
      }

      case "list": {
        // One line per row, then a block fit. It leaves as a resolved TEXT
        // element: the renderers already know how to draw a stack of lines, so
        // the list element needed no drawing code at all.
        const lines: string[] = [];
        const missingColumns: string[] = [];
        for (const source of rows) {
          const { text, missing } = interpolate(el.itemTemplate, source);
          for (const name of missing) {
            if (!missingColumns.includes(name)) missingColumns.push(name);
          }
          if (el.skipEmpty && text.trim().length === 0) continue;
          lines.push(el.bullet ? `${el.bullet} ${text}` : text);
        }
        for (const name of missingColumns) {
          warnings.push({
            elementId: el.id,
            kind: "missing-field",
            detail: `No column named "${name}".`,
          });
        }
        if (lines.length === 0) {
          warnings.push({
            elementId: el.id,
            kind: "empty-text",
            detail: "This list has no rows to show.",
          });
        }

        const fit = opts.fitBlock?.(el, lines) ?? {
          lines,
          fontSizePt: el.fontSizePt,
          overflowed: false,
          missingFont: true,
        };
        if (fit.missingFont) {
          warnings.push({
            elementId: el.id,
            kind: "missing-font",
            detail: `The font "${assetLabel(opts, el.fontId)}" is not on this device, so this list cannot be sized correctly.`,
          });
        }
        if (fit.overflowed) {
          warnings.push({
            elementId: el.id,
            kind: "overflow",
            detail: `${lines.length} lines do not fit at ${el.fit.minFontSizePt}pt.`,
          });
        }

        elements.push({
          ...base,
          kind: "text",
          lines: fit.lines,
          fontId: el.fontId,
          fontSizePt: fit.fontSizePt,
          align: el.align,
          vAlign: el.vAlign,
          anchor: el.fit.anchor,
          lineHeight: el.lineHeight,
          colorHex: el.colorHex,
          letterSpacingMm: el.letterSpacingMm,
          overflowed: fit.overflowed,
          ...(el.optical ? { optical: el.optical } : {}),
        });
        break;
      }

      case "rect":
        elements.push({
          ...base,
          kind: "rect",
          fillHex: el.fillHex,
          strokeHex: el.strokeHex,
          strokeWidthMm: el.strokeWidthMm,
          dashed: el.dashed,
        });
        break;

      case "line":
        elements.push({
          ...base,
          kind: "line",
          strokeHex: el.strokeHex,
          strokeWidthMm: el.strokeWidthMm,
          dashed: el.dashed,
        });
        break;

      case "image": {
        const source = el.imageId ? (opts.image?.(el.imageId) ?? null) : null;
        const missingName =
          el.imageId && !source ? assetLabel(opts, el.imageId) : null;
        if (missingName) {
          warnings.push({
            elementId: el.id,
            kind: "missing-image",
            detail: `"${missingName}" is not on this device.`,
          });
        }
        elements.push({
          ...base,
          kind: "image",
          image: source,
          missingName,
          fit: el.fit,
          opacity: el.opacity,
          // Spread, not defaulted: a design with no crop resolves to an element
          // with no crop, so nothing downstream has to tell "centred" apart
          // from "never cropped".
          ...(el.zoom === undefined ? {} : { zoom: el.zoom }),
          ...(el.focusX === undefined ? {} : { focusX: el.focusX }),
          ...(el.focusY === undefined ? {} : { focusY: el.focusY }),
        });
        break;
      }

      default: {
        // Only reachable from storage written by a different version. Saying so
        // beats dropping an element the user can see in the layer list.
        const unknown: { kind?: unknown } = el;
        warnings.push({
          elementId: (el as { id: string }).id,
          kind: "unknown-element",
          detail: `This design contains a "${String(unknown.kind)}" element that this version cannot draw.`,
        });
      }
    }
  }

  return { scene: { elements, backgroundHex: template.backgroundHex }, warnings };
}

/** The filename the user knows the asset by, falling back to its id. */
function assetLabel(opts: ResolveOptions, id: string): string {
  return opts.assetName?.(id) ?? id;
}

/** Fit stub for tests and for previewing before a font has loaded. */
export const noFit: FitTextFn = (element, text) => ({
  lines: text ? [text] : [],
  fontSizePt: element.fontSizePt,
  overflowed: false,
});
