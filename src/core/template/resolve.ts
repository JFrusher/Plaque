import { makeIconLookup } from "../../assets/icons";
import { fitText } from "../text/fit";
import type { LoadedFont } from "../text/measure";
import type { ResolveOptions } from "./bindings";

/**
 * Wires the real fitter and icon lookup into `resolveCard`.
 *
 * Everything that renders a card — the preview, the PDF, the tests, the sample
 * script — goes through this, so none of them can accidentally fit text a
 * different way from the others.
 */
export function makeResolveOptions(
  fonts: Map<string, LoadedFont>,
  uploadedIcons: Record<string, string> = {},
): ResolveOptions {
  const iconPath = makeIconLookup(uploadedIcons);
  return {
    iconPath,
    fitText: (el, text) => {
      const font = fonts.get(el.fontId);
      if (!font) {
        // No metrics means no honest fitting decision. Render at the requested
        // size and let the missing-font warning be the thing the user sees.
        return { lines: text ? [text] : [], fontSizePt: el.fontSizePt, overflowed: false };
      }
      return fitText(font, {
        text,
        boxWMm: el.w,
        boxHMm: el.h,
        fontSizePt: el.fontSizePt,
        lineHeight: el.lineHeight,
        letterSpacingMm: el.letterSpacingMm,
        fit: el.fit,
      });
    },
  };
}
