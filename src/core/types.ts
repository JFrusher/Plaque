/**
 * The scene graph, in millimetres, top-left origin, y increasing downward.
 *
 * Every stored coordinate in Plaque is a millimetre. No pixels, no points, no
 * inches live in state or in core/. Conversion happens only inside a renderer,
 * and the PDF y-flip happens in exactly one function (see render/pdf/renderPdf).
 */

export type Mm = number;
export type Pt = number;
/** `#rrggbb`. */
export type Hex = string;

export interface Point {
  x: Mm;
  y: Mm;
}

export interface Size {
  w: Mm;
  h: Mm;
}

export interface Rect extends Point, Size {}

/** A straight line, used for crop marks, cut lines and fold guides. */
export type Segment = readonly [Point, Point];

// ---------------------------------------------------------------------------
// Card and sheet
// ---------------------------------------------------------------------------

export type PageSizeName = "A4" | "LETTER";
export type Orientation = "portrait" | "landscape";

/**
 * `horizontal` splits the card into a top and a bottom panel at
 * `foldPositionMm` from the top; `vertical` splits into left and right at
 * `foldPositionMm` from the left.
 */
export type FoldAxis = "none" | "horizontal" | "vertical";

export interface CardSpec {
  widthMm: Mm;
  heightMm: Mm;
  fold: FoldAxis;
  /** From the top (horizontal fold) or the left (vertical fold). */
  foldPositionMm: Mm;
  /** FR-STA-04. Rotate the back panel so it reads from across the table. */
  invertBackPanel: boolean;
  /** Fills bleed past the cut line; crop marks sit outside it. */
  bleedMm: Mm;
}

export type CardRotation = 0 | 90;

export interface SheetSpec {
  page: PageSizeName;
  orientation: Orientation;
  marginTopMm: Mm;
  marginRightMm: Mm;
  marginBottomMm: Mm;
  marginLeftMm: Mm;
  gapXMm: Mm;
  gapYMm: Mm;
  /** Rotate each card on the sheet to fit more of them. */
  cardRotationDeg: CardRotation;
  /** Non-printable border of a typical home printer. Advisory, not enforced. */
  printerMarginMm: Mm;
  cropMarks: boolean;
  cutLines: boolean;
  foldGuides: boolean;
  /** Screen only. Never drawn into the PDF. */
  bleedGuides: boolean;
  /**
   * Print the back of each card on the reverse of the sheet. The flip edge is a
   * property of the printer, not the design — see PrinterProfile.
   */
  duplex: boolean;
  /**
   * PDF only. A strip along the foot of each sheet naming sizes, fold, applied
   * printer scale, card count and build hash, with a printed rule — so a
   * misconfigured print explains itself on paper (A8).
   */
  slugLine: boolean;
}

// ---------------------------------------------------------------------------
// Template elements (what the user drags)
// ---------------------------------------------------------------------------

export type ElementId = string;
export type HAlign = "left" | "center" | "right";
export type VAlign = "top" | "middle" | "bottom";
export type FitMode = "none" | "shrink" | "wrap" | "shrink-then-wrap";

/**
 * `"align"` means the text block sits wherever `align` puts it, so a centred
 * block keeps its centre as it shrinks and a right-aligned one keeps its right
 * edge. That covers most cases with one control.
 *
 * Any other value separates the two: `align` still decides how the lines sit
 * relative to EACH OTHER, while the anchor decides where the whole block sits
 * in the box. Centre-aligned lines anchored left shrink toward the left edge.
 */
export type ShrinkAnchor = "align" | HAlign;

export interface FitConfig {
  mode: FitMode;
  /** Floor for shrinking. Below this the text renders at the floor and reports overflow. */
  minFontSizePt: Pt;
  /** Ignored unless the mode wraps. */
  maxLines: number;
  /** The point the block shrinks around. */
  anchor: ShrinkAnchor;
}

/**
 * Which side of the sheet an element prints on. Absent means front — every
 * design written before duplex existed is a front-only design.
 */
export type CardSide = "front" | "back";

export interface ElementBase {
  id: ElementId;
  /** Card-local, top-left origin. Which fold panel it belongs to is derived, never stored. */
  x: Mm;
  y: Mm;
  w: Mm;
  h: Mm;
  z: number;
  /** Front unless stated. See `sideOf`. */
  side?: CardSide;
}

/** Optical typography, per element. See core/text/optical. */
export interface OpticalSpec {
  opticalAlign: boolean;
  hangingPunctuation: boolean;
  /** `null` keeps the font's defaults. Otherwise the exact feature list to apply. */
  features: string[] | null;
}

export interface TextElement extends ElementBase {
  kind: "text";
  /** e.g. `"{{First Name}} {{Last Name}}"`. Literal text needs no braces. */
  template: string;
  fontId: string;
  fontSizePt: Pt;
  align: HAlign;
  vAlign: VAlign;
  /** Multiple of font size. */
  lineHeight: number;
  colorHex: Hex;
  letterSpacingMm: Mm;
  fit: FitConfig;
  optical?: OpticalSpec;
}

export interface IconRule {
  /** Matched case-insensitively against the trimmed cell value. */
  match: string;
  iconId: string;
}

export interface IconElement extends ElementBase {
  kind: "icon";
  /** CSV column to read, e.g. `"Dietary"`. */
  sourceField: string;
  rules: IconRule[];
  /** `null` draws nothing when no rule matches. */
  fallbackIconId: string | null;
  colorHex: Hex;
}

export interface RectElement extends ElementBase {
  kind: "rect";
  fillHex: Hex | null;
  strokeHex: Hex | null;
  strokeWidthMm: Mm;
  dashed: boolean;
}

export interface LineElement extends ElementBase {
  kind: "line";
  strokeHex: Hex;
  strokeWidthMm: Mm;
  dashed: boolean;
}

/** `contain` preserves the image's aspect inside the box; `stretch` fills it. */
export type ImageFit = "contain" | "stretch";

export interface ImageElement extends ElementBase {
  kind: "image";
  /** Key into the image store. `null` until one is chosen. */
  imageId: string | null;
  fit: ImageFit;
  /** 0..1. Useful for a watermark sitting behind a name. */
  opacity: number;
}

/**
 * One line per row of the artefact — the menu, the run-sheet, the seating list.
 *
 * The second half of the row-scope unlock (discovery §1). It resolves into an
 * ordinary resolved TEXT element whose lines happen to have come from many rows,
 * so neither renderer needed a single line of new code to draw one.
 *
 * Fit applies to the whole block rather than to a line: shrink until every line
 * fits the width AND the stack fits the height.
 */
export interface ListElement extends ElementBase {
  kind: "list";
  /** Per-row template, e.g. `"{{First Name}} — {{Meal}}"`. */
  itemTemplate: string;
  /** Printed before each line. Empty for none. */
  bullet: string;
  /** Rows whose line comes out empty are dropped rather than printed as a gap. */
  skipEmpty: boolean;
  fontId: string;
  fontSizePt: Pt;
  align: HAlign;
  vAlign: VAlign;
  lineHeight: number;
  colorHex: Hex;
  letterSpacingMm: Mm;
  fit: FitConfig;
  optical?: OpticalSpec;
}

export type CardElement =
  | TextElement
  | IconElement
  | RectElement
  | LineElement
  | ImageElement
  | ListElement;

/**
 * Any field of any element kind, except the two that establish identity.
 *
 * `Partial<CardElement>` will not do: it is a union of partials, so it rejects a
 * patch that names a field only some members have. This maps over the union's
 * keys instead, giving each one the type it has on the members that declare it.
 */
type PatchableKey = Exclude<
  | keyof TextElement
  | keyof IconElement
  | keyof RectElement
  | keyof LineElement
  | keyof ImageElement
  | keyof ListElement,
  "kind" | "id"
>;

type FieldValue<K extends PropertyKey> =
  Extract<CardElement, Record<K, unknown>> extends infer E
    ? E extends Record<K, infer V>
      ? V
      : never
    : never;

export type ElementPatch = { [K in PatchableKey]?: FieldValue<K> };

/**
 * How many CSV rows one printed artefact consumes. Discovery §1.
 *
 * `per-row` is a place card, a badge, a gift tag. `per-group` is a table number
 * or a table menu. `document` is a kitchen run-sheet or a seating list. Absent
 * means per-row, which is what every design written before this existed meant.
 */
export type RowScope =
  | { kind: "per-row" }
  | { kind: "per-group"; byColumn: string }
  | { kind: "document" };

export interface Template {
  elements: CardElement[];
  backgroundHex: Hex | null;
  rowScope?: RowScope;
  /**
   * Sparse per-row design patches, by row id then element id. See
   * core/template/overrides — design, not data, so it lives here and travels in
   * the project file.
   */
  overrides?: Record<string, Record<ElementId, ElementPatch>>;
}

// ---------------------------------------------------------------------------
// Resolved scene (after bindings + fitting). Renderers consume only this.
// ---------------------------------------------------------------------------

/**
 * A resolved element's box is in SHEET coordinates by the time it reaches a
 * renderer, and its content is rotated by `rotationDeg` about the box centre.
 * That single convention covers both fold inversion (180) and on-sheet card
 * rotation (90), so neither renderer needs to know why it is rotating.
 */
export interface ResolvedBase {
  id: ElementId;
  x: Mm;
  y: Mm;
  w: Mm;
  h: Mm;
  rotationDeg: number;
  z: number;
}

export interface ResolvedText extends ResolvedBase {
  kind: "text";
  lines: string[];
  fontId: string;
  /** The size fitting settled on. Both renderers use this verbatim. */
  fontSizePt: Pt;
  align: HAlign;
  vAlign: VAlign;
  /** Where the block sits in the box; `"align"` follows `align`. */
  anchor: ShrinkAnchor;
  lineHeight: number;
  colorHex: Hex;
  letterSpacingMm: Mm;
  /** True when the fit floor was hit and the text still does not fit. */
  overflowed: boolean;
  /** Carried through so both renderers lay the line out identically. */
  optical?: OpticalSpec;
}

export interface ResolvedIcon extends ResolvedBase {
  kind: "icon";
  /** SVG path data. `null` when no rule matched. */
  pathD: string | null;
  /** Knocked out of the shape — the diagonal bar on a "free from" mark. */
  cutD: string | null;
  /** The space `pathD` is drawn in, so it can be fitted to the element box. */
  view: { x: Mm; y: Mm; w: Mm; h: Mm };
  colorHex: Hex;
  /** What the knockout is painted in: the card's background, or paper white. */
  cutHex: Hex;
}

export interface ResolvedRect extends ResolvedBase {
  kind: "rect";
  fillHex: Hex | null;
  strokeHex: Hex | null;
  strokeWidthMm: Mm;
  dashed: boolean;
}

export interface ResolvedLine extends ResolvedBase {
  kind: "line";
  strokeHex: Hex;
  strokeWidthMm: Mm;
  dashed: boolean;
}

export interface ResolvedImage extends ResolvedBase {
  kind: "image";
  /** Everything a renderer needs to draw it. `null` when there is nothing to draw. */
  image: ResolvedImageSource | null;
  /**
   * The filename of an image the design references but this device does not
   * have; `null` when nothing is wrong. The screen draws a named placeholder
   * from it, and export is blocked — a silently blank card is the failure this
   * field exists to prevent (S-D1.4).
   */
  missingName: string | null;
  fit: ImageFit;
  opacity: number;
}

export interface ResolvedImageSource {
  id: string;
  /** Object URL for the screen. */
  url: string;
  /** Original bytes for the PDF. */
  data: Uint8Array;
  mime: "image/png" | "image/jpeg";
  /** Pixels, used to preserve aspect under `contain`. */
  naturalW: number;
  naturalH: number;
}

export type ResolvedElement =
  | ResolvedText
  | ResolvedIcon
  | ResolvedRect
  | ResolvedLine
  | ResolvedImage;

export interface CardScene {
  elements: ResolvedElement[];
  backgroundHex: Hex | null;
}

export interface PlacedCard {
  /** Top-left of the card's footprint on the sheet. */
  origin: Point;
  /** Footprint after any on-sheet rotation. */
  footprint: Size;
  /** Which artefact this slot holds — one guest, one table, or the whole list. */
  artefactIndex: number;
  scene: CardScene;
}

export interface SheetGuides {
  cropMarks: Segment[];
  cutLines: Segment[];
  foldGuides: Segment[];
  /** Screen only. */
  bleedBoxes: Rect[];
}

export interface Sheet {
  index: number;
  pageWidthMm: Mm;
  pageHeightMm: Mm;
  cards: PlacedCard[];
  guides: SheetGuides;
}
