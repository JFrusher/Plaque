/**
 * Bundled dietary icons.
 *
 * Every icon is fill-only SVG path data in a 24x24 viewBox, which renders in
 * both worlds — `<path d>` in the preview and `drawSvgPath` in the PDF — so an
 * icon can never look right on screen and wrong on paper.
 *
 * The "free from" marks carry a second `cut` path: the diagonal bar. It has to
 * be a separate path drawn in the card's own background colour, because PDF
 * fills with the nonzero rule and a bar in the same path would merge into the
 * silhouette. A caterer reading "contains nuts" off an icon that means "no
 * nuts" is the one failure this app must not have.
 *
 * ponytail: these are clean geometric stand-ins, not illustrated marks. They
 * read at 8mm, which is the bar. Swapping in drawn artwork means replacing the
 * path data here and nothing else.
 */

export interface IconArt {
  d: string;
  /** Knocked out of the shape in the card background colour. */
  cut?: string;
}

export interface BundledIcon extends IconArt {
  id: string;
  label: string;
  /**
   * Spellings a guest list is likely to use for this icon. Matching is exact,
   * so "Gluten-Free" and "Gluten free" are two different values and both have
   * to be listed — guessing between near-misses would risk the wrong meal.
   */
  aliases: string[];
}

/** The diagonal bar shared by the "free from" icons. */
const BAR = "M3.6 18.5 18.5 3.6l1.9 1.9L5.5 20.4Z";

export const BUNDLED_ICONS: BundledIcon[] = [
  {
    id: "vegetarian",
    label: "Vegetarian",
    aliases: ["Vegetarian", "Veggie", "V", "VEG"],
    d: "M20 4C10.5 4.6 4.6 10.5 4 20c9.5-.6 15.4-6.5 16-16Z",
    cut: "M16.4 6.6 7.4 15.6l1.2 1.2 9-9Z",
  },
  {
    id: "vegan",
    label: "Vegan",
    aliases: ["Vegan", "VG", "Plant-based", "Plant based"],
    d: "M11.2 21.5v-7.9h1.6v7.9Zm1.6-8.6c0-3.9 2.9-6.9 6.9-6.9 0 3.9-3 6.9-6.9 6.9Zm-1.6 1.1C7.7 14 5 11.3 5 7.7c3.6 0 6.3 2.7 6.3 6.3Z",
  },
  {
    id: "gluten-free",
    label: "Gluten free",
    aliases: ["Gluten-Free", "Gluten Free", "Gluten free", "GF", "No gluten", "Coeliac", "Celiac"],
    d: "M12 2.2c1.7 1.5 1.7 3.6 0 5.1-1.7-1.5-1.7-3.6 0-5.1Zm0 5.4c1.7 1.5 1.7 3.6 0 5.1-1.7-1.5-1.7-3.6 0-5.1Zm0 5.4c1.7 1.5 1.7 3.6 0 5.1-1.7-1.5-1.7-3.6 0-5.1ZM8.4 6.2c2.3.7 3.3 2.6 2.5 4.9-2.3-.7-3.3-2.6-2.5-4.9Zm7.2 0c.8 2.3-.2 4.2-2.5 4.9-.8-2.3.2-4.2 2.5-4.9ZM8.4 11.8c2.3.7 3.3 2.6 2.5 4.9-2.3-.7-3.3-2.6-2.5-4.9Zm7.2 0c.8 2.3-.2 4.2-2.5 4.9-.8-2.3.2-4.2 2.5-4.9Z",
    cut: BAR,
  },
  {
    id: "dairy-free",
    label: "Dairy free",
    aliases: ["Dairy-Free", "Dairy Free", "Dairy free", "DF", "No dairy", "Lactose-free", "Lactose free"],
    d: "M12 2.8c3.6 4.3 5.6 7.2 5.6 9.8a5.6 5.6 0 1 1-11.2 0c0-2.6 2-5.5 5.6-9.8Z",
    cut: BAR,
  },
  {
    id: "nut-free",
    label: "Nut free",
    aliases: ["Nut-Free", "Nut Free", "Nut free", "NF", "No nuts", "Nut allergy"],
    d: "M12 2.6c3.9 0 6.6 3.5 6.6 8.2s-2.7 10.6-6.6 10.6-6.6-5.9-6.6-10.6S8.1 2.6 12 2.6Z",
    cut: BAR,
  },
  {
    id: "halal",
    label: "Halal",
    aliases: ["Halal"],
    d: "M14.6 3.3a9.2 9.2 0 1 0 6.1 11.4 7.2 7.2 0 1 1-6.1-11.4Zm4.3 5.1.9 2.5 2.5.9-2.5.9-.9 2.5-.9-2.5-2.5-.9 2.5-.9Z",
  },
  {
    id: "kosher",
    label: "Kosher",
    aliases: ["Kosher"],
    d: "M12 1.8 3.1 17.2h17.8Zm0 20.4L3.1 6.8h17.8Z",
    cut: "M12 8.2 7.9 15.3h8.2Z",
  },
  {
    id: "child",
    label: "Child",
    aliases: ["Child", "Children", "Kids", "Kid", "Child meal"],
    d: "M12 2.4a2.7 2.7 0 1 1 0 5.4 2.7 2.7 0 0 1 0-5.4ZM8.3 9h7.4a1.7 1.7 0 0 1 1.7 1.7v5.6h-2.5v5.3H9.1v-5.3H6.6v-5.6A1.7 1.7 0 0 1 8.3 9Z",
  },
];

export const ICON_VIEWBOX = 24;

export function bundledIcon(id: string): BundledIcon | undefined {
  return BUNDLED_ICONS.find((i) => i.id === id);
}

/**
 * Icon lookup over the bundled set plus whatever the user has uploaded.
 * Uploaded icons are a single path — knockouts are a bundled-artwork idea.
 */
export function makeIconLookup(uploaded: Record<string, string> = {}) {
  return (id: string): IconArt | null => {
    const custom = uploaded[id];
    if (custom) return { d: custom };
    const bundled = bundledIcon(id);
    if (!bundled) return null;
    return bundled.cut ? { d: bundled.d, cut: bundled.cut } : { d: bundled.d };
  };
}
