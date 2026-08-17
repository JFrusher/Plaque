import type { CardSpec, SheetSpec, Template } from "../core/types";

/**
 * Undo covers the design — the card, the sheet and the template — and nothing
 * else. Guest data is not undoable (re-uploading a CSV is not an edit), and
 * neither is UI state: undoing a selection or a page turn is never what anyone
 * means by Ctrl+Z.
 */
export interface Snapshot {
  card: CardSpec;
  sheet: SheetSpec;
  template: Template;
}

export const HISTORY_LIMIT = 50;

export function snapshot(s: Snapshot): Snapshot {
  return {
    card: { ...s.card },
    sheet: { ...s.sheet },
    template: {
      backgroundHex: s.template.backgroundHex,
      elements: s.template.elements.map((el) => ({ ...el })),
    },
  };
}

/** Newest last. Drops the oldest entry past the limit. */
export function pushHistory(past: Snapshot[], entry: Snapshot): Snapshot[] {
  const next = [...past, entry];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}
