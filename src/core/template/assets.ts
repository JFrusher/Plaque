import { BUNDLED_FONTS } from "../../assets/fonts";
import type { ElementId, Template } from "../types";

export interface MissingAsset {
  /** The id the design still references. */
  id: string;
  kind: "image" | "font";
  /** Every element affected, so the report can point at all of them. */
  elementIds: ElementId[];
}

const BUNDLED_FONT_IDS = new Set(BUNDLED_FONTS.map((f) => f.id));

/**
 * Assets the design references that are not on this device (S-D1.4).
 *
 * Row-independent on purpose: a missing crest is missing for all 150 guests, so
 * this needs no data and can gate export before a single card is resolved.
 *
 * A missing font is the more dangerous of the two. Without its metrics there is
 * no honest fitting decision to make — see core/text/fit — so a design in this
 * state must not reach a printer.
 */
export function missingAssets(
  template: Template,
  hasImage: (id: string) => boolean,
  hasFont: (id: string) => boolean,
): MissingAsset[] {
  const found = new Map<string, MissingAsset>();

  const note = (id: string, kind: MissingAsset["kind"], elementId: ElementId) => {
    const existing = found.get(id);
    if (existing) existing.elementIds.push(elementId);
    else found.set(id, { id, kind, elementIds: [elementId] });
  };

  for (const el of template.elements) {
    if (el.kind === "image" && el.imageId && !hasImage(el.imageId)) {
      note(el.imageId, "image", el.id);
    }
    // A bundled face that has not finished loading is not missing, it is early.
    if (el.kind === "text" && !BUNDLED_FONT_IDS.has(el.fontId) && !hasFont(el.fontId)) {
      note(el.fontId, "font", el.id);
    }
  }

  return [...found.values()];
}
