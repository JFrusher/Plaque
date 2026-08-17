/**
 * The bundled faces. Metadata only — no binaries are imported here, so this
 * module is safe for both the browser and the Node test run.
 *
 * All six are SIL Open Font License 1.1. See LICENSES.md.
 */

export type FontCategory = "serif" | "sans" | "display" | "script";

export interface BundledFont {
  id: string;
  /** CSS family name, also used for the FontFace registered in the preview. */
  family: string;
  label: string;
  category: FontCategory;
  /** Filename inside src/assets/fonts. */
  file: string;
}

export const BUNDLED_FONTS: BundledFont[] = [
  {
    id: "crimson",
    family: "Crimson Text",
    label: "Crimson Text",
    category: "serif",
    file: "CrimsonText-Regular.ttf",
  },
  {
    id: "crimson-semibold",
    family: "Crimson Text SemiBold",
    label: "Crimson Text SemiBold",
    category: "serif",
    file: "CrimsonText-SemiBold.ttf",
  },
  {
    id: "marcellus",
    family: "Marcellus",
    label: "Marcellus",
    category: "display",
    file: "Marcellus-Regular.ttf",
  },
  {
    id: "lato",
    family: "Lato",
    label: "Lato",
    category: "sans",
    file: "Lato-Regular.ttf",
  },
  {
    id: "great-vibes",
    family: "Great Vibes",
    label: "Great Vibes",
    category: "script",
    file: "GreatVibes-Regular.ttf",
  },
  {
    id: "parisienne",
    family: "Parisienne",
    label: "Parisienne",
    category: "script",
    file: "Parisienne-Regular.ttf",
  },
];

export const DEFAULT_FONT_ID = "crimson";

export function bundledFont(id: string): BundledFont | undefined {
  return BUNDLED_FONTS.find((f) => f.id === id);
}
