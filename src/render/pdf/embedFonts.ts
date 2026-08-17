import fontkit from "@pdf-lib/fontkit";
import type { PDFDocument, PDFFont } from "pdf-lib";
import type { LoadedFont } from "../../core/text/measure";

export interface EmbedResult {
  fonts: Map<string, PDFFont>;
  /** Faces that had to be embedded whole because subsetting failed. */
  notSubset: string[];
}

/**
 * Embeds each face exactly once per document.
 *
 * Once, not once per card: a 150-guest sheet re-embedding a 650KB face for every
 * name is the difference between a 400KB PDF and a 90MB one, and it is most of
 * the three-second export budget.
 */
export async function embedFonts(
  doc: PDFDocument,
  fonts: Iterable<LoadedFont>,
): Promise<EmbedResult> {
  doc.registerFontkit(fontkit);

  const out = new Map<string, PDFFont>();
  const notSubset: string[] = [];

  for (const font of fonts) {
    if (out.has(font.id)) continue;
    try {
      out.set(font.id, await doc.embedFont(font.data, { subset: true }));
    } catch {
      // Some faces — particularly ones a user uploaded — will not subset. A
      // large PDF beats a failed export, so fall back to embedding the whole file.
      out.set(font.id, await doc.embedFont(font.data, { subset: false }));
      notSubset.push(font.id);
    }
  }

  return { fonts: out, notSubset };
}
