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

export interface ElementBase {
  id: ElementId;
  /** Card-local, top-left origin. Which fold panel it belongs to is derived, never stored. */
  x: Mm;
  y: Mm;
  w: Mm;
  h: Mm;
  z: number;
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

export type CardElement =
  | TextElement
  | IconElement
  | RectElement
  | LineElement
  | ImageElement;

export interface Template {
  elements: CardElement[];
  backgroundHex: Hex | null;
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
  /**
   * Everything a renderer needs to draw it. `null` when the image is missing —
   * the element then draws nothing rather than a broken placeholder.
   */
  image: ResolvedImageSource | null;
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
  guestIndex: number;
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
