import { DEFAULT_FONT_ID } from "../../assets/fonts";
import type { CardElement, CardSpec, ElementId } from "../types";
import { DEFAULT_FIT } from "../text/fit";
import { defaultIconRules } from "./defaults";

/**
 * One table describing every element kind (F3).
 *
 * Adding a kind used to mean editing four places that could disagree: the
 * palette in the elements panel, the factory in the store, the layer-list label,
 * and the type union. This is the first three, in one place, next to each other.
 *
 * ponytail: this is NOT a plugin registry, and a contributor cannot add an
 * element kind from outside the bundle. The two renderers still switch on
 * `kind`, and that is deliberate — TypeScript's exhaustiveness checking on the
 * union is what guarantees a new kind cannot be silently dropped by one renderer
 * and drawn by the other, which is exactly the class of bug this codebase most
 * needs to prevent. A registry that took render functions would trade that
 * guarantee for a flexibility nothing has asked for. Upgrade path if a real
 * out-of-tree element type ever turns up: add `measure`, `toSvg` and `toPdf` to
 * these entries and have the renderers look them up instead of switching.
 */
export interface ElementKindSpec {
  kind: CardElement["kind"];
  /** Shown on the "add" button. */
  label: string;
  /** How the layer list names an instance. */
  describe: (element: CardElement) => string;
  /** A new one, centred on the card. */
  create: (context: { id: ElementId; z: number; card: CardSpec; headers: string[] }) => CardElement;
}

const centre = (card: CardSpec) => ({ cx: card.widthMm / 2, cy: card.heightMm / 2 });

export const ELEMENT_KINDS: ElementKindSpec[] = [
  {
    kind: "text",
    label: "Text",
    describe: (el) => (el.kind === "text" ? el.template || "(empty)" : ""),
    create: ({ id, z, card, headers }) => {
      const { cx, cy } = centre(card);
      return {
        id,
        z,
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
    },
  },
  {
    kind: "list",
    label: "List",
    describe: (el) => (el.kind === "list" ? el.itemTemplate || "(empty list)" : ""),
    create: ({ id, z, card, headers }) => {
      const { cx, cy } = centre(card);
      return {
        id,
        z,
        kind: "list",
        // Tall by default: a list is a block of rows, not a caption.
        x: cx - 30,
        y: cy - 20,
        w: 60,
        h: 40,
        itemTemplate: headers[0] ? `{{${headers[0]}}}` : "Item",
        bullet: "",
        skipEmpty: true,
        fontId: DEFAULT_FONT_ID,
        fontSizePt: 10,
        align: "left",
        vAlign: "top",
        lineHeight: 1.35,
        colorHex: "#171613",
        letterSpacingMm: 0,
        // Shrink the block rather than dropping rows: a menu missing its last
        // guest is worse than a menu set two points smaller.
        fit: { ...DEFAULT_FIT, mode: "shrink", minFontSizePt: 6 },
      };
    },
  },
  {
    kind: "icon",
    label: "Icon",
    describe: (el) => (el.kind === "icon" ? (el.sourceField ? `by ${el.sourceField}` : "(no column)") : ""),
    create: ({ id, z, card, headers }) => {
      const { cx, cy } = centre(card);
      return {
        id,
        z,
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
    },
  },
  {
    kind: "image",
    label: "Image",
    describe: (el) =>
      el.kind === "image"
        ? el.imageId
          ? el.imageId.replace(/^img:/, "").replace(/:\d+$/, "")
          : "(no image)"
        : "",
    create: ({ id, z, card }) => {
      const { cx, cy } = centre(card);
      return {
        id,
        z,
        kind: "image",
        x: cx - 12,
        y: cy - 12,
        w: 24,
        h: 24,
        imageId: null,
        fit: "contain",
        opacity: 1,
      };
    },
  },
  {
    kind: "rect",
    label: "Box",
    describe: () => "box",
    create: ({ id, z, card }) => {
      const { cx, cy } = centre(card);
      return {
        id,
        z,
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
    },
  },
  {
    kind: "line",
    label: "Line",
    describe: (el) => (el.w >= el.h ? "horizontal rule" : "vertical rule"),
    create: ({ id, z, card }) => {
      const { cx, cy } = centre(card);
      return {
        id,
        z,
        kind: "line",
        x: cx - 15,
        y: cy - 1,
        w: 30,
        h: 2,
        strokeHex: "#46443f",
        strokeWidthMm: 0.3,
        dashed: false,
      };
    },
  },
];

const BY_KIND = new Map(ELEMENT_KINDS.map((spec) => [spec.kind, spec]));

export function elementKind(kind: CardElement["kind"]): ElementKindSpec | undefined {
  return BY_KIND.get(kind);
}

/** How the layer list and the announcer name an element. */
export function describeElement(element: CardElement): string {
  return elementKind(element.kind)?.describe(element) ?? element.kind;
}
