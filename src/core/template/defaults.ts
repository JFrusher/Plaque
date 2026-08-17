import { DEFAULT_FONT_ID } from "../../assets/fonts";
import { BUNDLED_ICONS } from "../../assets/icons";
import { defaultNameTemplate, guessMapping } from "../csv/guessMapping";
import { panelBounds } from "../geometry/fold";
import { DEFAULT_FIT } from "../text/fit";
import type { CardElement, CardSpec, ElementId, IconRule, SheetSpec, Template } from "../types";

let fallbackCounter = 0;

/**
 * `crypto.randomUUID` only exists in a secure context, so it is undefined when
 * the app is served from a plain `http://` address on a LAN or intranet. Ids
 * only have to be unique within one document, not unguessable, so a timestamp
 * plus a counter plus randomness is a perfectly good substitute.
 */
export function newId(): ElementId {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  fallbackCounter += 1;
  const rand = Math.random().toString(36).slice(2, 10);
  return `el-${Date.now().toString(36)}-${fallbackCounter.toString(36)}-${rand}`;
}

/** A flat 85x55mm place card — the most common thing anyone prints. */
export function defaultCard(): CardSpec {
  return {
    widthMm: 85,
    heightMm: 55,
    fold: "none",
    foldPositionMm: 27.5,
    invertBackPanel: true,
    bleedMm: 0,
  };
}

export function defaultSheet(): SheetSpec {
  return {
    page: "A4",
    orientation: "portrait",
    marginTopMm: 10,
    marginRightMm: 10,
    marginBottomMm: 10,
    marginLeftMm: 10,
    gapXMm: 5,
    gapYMm: 5,
    cardRotationDeg: 0,
    printerMarginMm: 5,
    cropMarks: true,
    cutLines: true,
    foldGuides: true,
    bleedGuides: true,
  };
}

/**
 * A rule for every spelling each bundled icon answers to, so a guest list that
 * says "Gluten-Free", "Gluten Free" or "GF" all land on the same icon without
 * the user writing rules by hand.
 */
export function defaultIconRules(): IconRule[] {
  return BUNDLED_ICONS.flatMap((icon) =>
    icon.aliases.map((match) => ({ match, iconId: icon.id })),
  );
}

/**
 * A card that renders something sensible the moment a CSV lands, so the first
 * screen is never an empty rectangle. Every part of it is then draggable.
 */
export function defaultTemplate(headers: string[], card = defaultCard()): Template {
  const guess = guessMapping(headers);
  const nameTemplate = defaultNameTemplate(headers);
  const elements: CardElement[] = [];

  // A folded card gets the same content on both panels, because that is the
  // entire point of folding one: the guest reads the front, the table across
  // reads the back. The back panel's inversion is applied at render.
  const panels = card.fold === "none" ? [panelBounds("single", card)] : [
    panelBounds("front", card),
    panelBounds("back", card),
  ];

  let z = 0;
  for (const panel of panels) {
    const inset = 8;
    const w = panel.w - inset * 2;
    const hasTable = Boolean(guess.table);
    const nameH = 14;
    // Nudge the name up when a table line sits under it.
    const nameY = panel.y + panel.h / 2 - nameH / 2 - (hasTable ? 4 : 0);

    elements.push({
      kind: "text",
      id: newId(),
      x: panel.x + inset,
      y: nameY,
      w,
      h: nameH,
      z: z++,
      template: nameTemplate,
      fontId: DEFAULT_FONT_ID,
      fontSizePt: 22,
      align: "center",
      vAlign: "middle",
      lineHeight: 1.15,
      colorHex: "#171613",
      letterSpacingMm: 0,
      fit: { ...DEFAULT_FIT },
    });

    if (guess.table) {
      elements.push({
        kind: "text",
        id: newId(),
        x: panel.x + inset,
        y: nameY + nameH + 1,
        w,
        h: 7,
        z: z++,
        template: `{{${guess.table}}}`,
        fontId: DEFAULT_FONT_ID,
        fontSizePt: 10,
        align: "center",
        vAlign: "middle",
        lineHeight: 1.2,
        colorHex: "#6f6d68",
        letterSpacingMm: 0.3,
        fit: { ...DEFAULT_FIT, mode: "shrink", minFontSizePt: 6 },
      });
    }

    if (guess.dietary) {
      elements.push({
        kind: "icon",
        id: newId(),
        x: panel.x + panel.w - inset - 8,
        y: panel.y + panel.h - inset - 8,
        w: 8,
        h: 8,
        z: z++,
        sourceField: guess.dietary,
        rules: defaultIconRules(),
        fallbackIconId: null,
        colorHex: "#46443f",
      });
    }
  }

  return { elements, backgroundHex: null };
}
