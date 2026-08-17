import type {
  CardScene,
  CardSpec,
  ElementId,
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
}

/** Injected so bindings stays pure and testable without loading a font. */
export type FitTextFn = (element: TextElement, text: string) => FitResult;
export type IconPathFn = (iconId: string) => IconArt | null;
export type ImageFn = (imageId: string) => ResolvedImageSource | null;

export interface ResolveOptions {
  fitText: FitTextFn;
  iconPath: IconPathFn;
  /** Optional: without it, image elements resolve to nothing and warn. */
  image?: ImageFn;
}

export type WarningKind =
  | "overflow"
  | "missing-field"
  | "missing-icon"
  | "missing-image"
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
        if (el.imageId && !source) {
          warnings.push({
            elementId: el.id,
            kind: "missing-image",
            detail: "That image is no longer available on this device.",
          });
        }
        elements.push({ ...base, kind: "image", image: source, fit: el.fit, opacity: el.opacity });
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

/** Fit stub for tests and for previewing before a font has loaded. */
export const noFit: FitTextFn = (element, text) => ({
  lines: text ? [text] : [],
  fontSizePt: element.fontSizePt,
  overflowed: false,
});
