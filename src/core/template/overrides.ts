import type { CardElement, ElementId, ElementPatch, Template } from "../types";

export type { ElementPatch };

/**
 * Per-row design overrides (D1, discovery §6.13).
 *
 * One long name in a hundred and fifty does not justify forking the template, or
 * shrinking every other card to match. A sparse patch fixes that one card and
 * leaves the rest alone.
 *
 * Keyed by row id then element id, and stored on the TEMPLATE because it is
 * design, not data: it belongs in the project file next to the elements it
 * patches, and it is undoable with them.
 */
export type RowOverrides = Record<string, Record<ElementId, ElementPatch>>;

/**
 * The template as this row should print it.
 *
 * Returns the SAME object when there is nothing to apply, so the common path
 * allocates nothing and memoised consumers do not re-render.
 */
export function templateForRow(template: Template, rowId: string): Template {
  const patches = template.overrides?.[rowId];
  if (!patches || Object.keys(patches).length === 0) return template;

  return {
    ...template,
    elements: template.elements.map((el) => {
      const patch = patches[el.id];
      // `kind` is never patchable: an override turning a text element into an
      // image would leave the rest of the patch nonsense.
      return patch ? ({ ...el, ...patch, kind: el.kind } as CardElement) : el;
    }),
  };
}

/** Adds or merges a patch. Returns a new overrides map; never mutates. */
export function withOverride(
  overrides: RowOverrides | undefined,
  rowId: string,
  elementId: ElementId,
  patch: ElementPatch,
): RowOverrides {
  const forRow = { ...(overrides?.[rowId] ?? {}) };
  forRow[elementId] = { ...forRow[elementId], ...patch };
  return { ...overrides, [rowId]: forRow };
}

/**
 * Drops one element's override, or the row's entire set when `elementId` is
 * omitted. An empty row entry is removed rather than left behind, so
 * `hasOverrides` stays honest and the project file does not accumulate litter.
 */
export function withoutOverride(
  overrides: RowOverrides | undefined,
  rowId: string,
  elementId?: ElementId,
): RowOverrides {
  if (!overrides?.[rowId]) return overrides ?? {};
  const next = { ...overrides };
  if (!elementId) {
    delete next[rowId];
    return next;
  }
  const forRow = { ...next[rowId] };
  delete forRow[elementId];
  if (Object.keys(forRow).length === 0) delete next[rowId];
  else next[rowId] = forRow;
  return next;
}

export function hasOverrides(template: Template, rowId: string): boolean {
  return Object.keys(template.overrides?.[rowId] ?? {}).length > 0;
}

/** Row ids that carry an override — what the row list marks up. */
export function overriddenRowIds(template: Template): string[] {
  return Object.entries(template.overrides ?? {})
    .filter(([, patches]) => Object.keys(patches).length > 0)
    .map(([rowId]) => rowId);
}

/**
 * Overrides for rows that no longer exist, e.g. after a new CSV. Kept rather
 * than dropped automatically — losing a fix silently is worse than carrying a
 * few dead bytes — but reported so the user can clear them.
 */
export function orphanedOverrides(template: Template, liveRowIds: Iterable<string>): string[] {
  const live = new Set(liveRowIds);
  return overriddenRowIds(template).filter((id) => !live.has(id));
}
