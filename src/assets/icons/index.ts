/**
 * Bundled dietary icons.
 *
 * Every icon is a single fill-only SVG path in a 24x24 viewBox. That one
 * representation renders in both worlds — `<path d>` in the preview and
 * `drawSvgPath` in the PDF — so an icon can never look right on screen and
 * wrong on paper.
 *
 * Fill rule is nonzero, so overlapping subpaths merge into one silhouette
 * rather than punching holes.
 *
 * ponytail: these are clean geometric stand-ins, not illustrated marks. They
 * read at 8mm, which is the bar. Swapping in drawn artwork means replacing the
 * `d` strings here and nothing else.
 */

export interface BundledIcon {
  id: string;
  label: string;
  /** Path data in a 24x24 viewBox. */
  d: string;
}

/** The diagonal bar shared by the "free from" icons. */
const BAR = "M4.4 18.2 18.2 4.4l1.4 1.4L5.8 19.6Z";

export const BUNDLED_ICONS: BundledIcon[] = [
  {
    id: "vegetarian",
    label: "Vegetarian",
    d: "M20 4C10.5 4.6 4.6 10.5 4 20c9.5-.6 15.4-6.5 16-16Zm-3.6 2.6L7.4 15.6l1.2 1.2 9-9Z",
  },
  {
    id: "vegan",
    label: "Vegan",
    d: "M11.2 21.5v-7.9h1.6v7.9Zm1.6-8.6c0-3.9 2.9-6.9 6.9-6.9 0 3.9-3 6.9-6.9 6.9Zm-1.6 1.1C7.7 14 5 11.3 5 7.7c3.6 0 6.3 2.7 6.3 6.3Z",
  },
  {
    id: "gluten-free",
    label: "Gluten free",
    d: `M12 2.2c1.7 1.5 1.7 3.6 0 5.1-1.7-1.5-1.7-3.6 0-5.1Zm0 5.4c1.7 1.5 1.7 3.6 0 5.1-1.7-1.5-1.7-3.6 0-5.1Zm0 5.4c1.7 1.5 1.7 3.6 0 5.1-1.7-1.5-1.7-3.6 0-5.1ZM8.8 6.6c2.1.6 3 2.4 2.3 4.5-2.1-.6-3-2.4-2.3-4.5Zm6.4 0c.7 2.1-.2 3.9-2.3 4.5-.7-2.1.2-3.9 2.3-4.5Z${BAR}`,
  },
  {
    id: "dairy-free",
    label: "Dairy free",
    d: `M12 2.8c3.6 4.3 5.6 7.2 5.6 9.8a5.6 5.6 0 1 1-11.2 0c0-2.6 2-5.5 5.6-9.8Z${BAR}`,
  },
  {
    id: "nut-free",
    label: "Nut free",
    d: `M12 2.6c3.9 0 6.6 3.5 6.6 8.2s-2.7 10.6-6.6 10.6-6.6-5.9-6.6-10.6S8.1 2.6 12 2.6Z${BAR}`,
  },
  {
    id: "halal",
    label: "Halal",
    d: "M14.6 3.3a9.2 9.2 0 1 0 6.1 11.4 7.2 7.2 0 1 1-6.1-11.4Zm4.3 5.1.9 2.5 2.5.9-2.5.9-.9 2.5-.9-2.5-2.5-.9 2.5-.9Z",
  },
  {
    id: "kosher",
    label: "Kosher",
    d: "M12 1.8 3.1 17.2h17.8Zm0 20.4L3.1 6.8h17.8Z",
  },
  {
    id: "child",
    label: "Child",
    d: "M12 2.4a2.7 2.7 0 1 1 0 5.4 2.7 2.7 0 0 1 0-5.4ZM8.3 9h7.4a1.7 1.7 0 0 1 1.7 1.7v5.6h-2.5v5.3H9.1v-5.3H6.6v-5.6A1.7 1.7 0 0 1 8.3 9Z",
  },
];

export const ICON_VIEWBOX = 24;

export function bundledIcon(id: string): BundledIcon | undefined {
  return BUNDLED_ICONS.find((i) => i.id === id);
}

/** Icon lookup over the bundled set plus whatever the user has uploaded. */
export function makeIconLookup(uploaded: Record<string, string> = {}) {
  return (id: string): string | null => uploaded[id] ?? bundledIcon(id)?.d ?? null;
}
