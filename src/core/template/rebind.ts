import { guessMapping, type FieldGuesses } from "../csv/guessMapping";
import { tokensIn } from "../csv/interpolate";
import type { CardElement, Template } from "../types";

/**
 * Re-attaching a saved design to a new CSV (E5, S-B.1).
 *
 * A template written against "First Name","Table" is useless next year when the
 * export says "Guest First","Tbl" — every token resolves to nothing and the
 * cards print blank. Rebinding maps tokens by column ROLE rather than by the
 * literal header, so the design survives the new file.
 *
 * Anything that cannot be matched is reported, never guessed at: a token
 * silently pointed at the wrong column would print the wrong guest's name,
 * which is worse than printing none.
 */
export interface RebindResult {
  template: Template;
  /** old header → new header, for the report. */
  renamed: Record<string, string>;
  /** Tokens with no column in the new file, by name. These block export. */
  unmatched: string[];
}

const ROLES: (keyof FieldGuesses)[] = [
  "firstName",
  "lastName",
  "fullName",
  "table",
  "dietary",
  "entree",
];

export function rebindTemplate(
  template: Template,
  oldHeaders: string[],
  newHeaders: string[],
): RebindResult {
  const before = guessMapping(oldHeaders);
  const after = guessMapping(newHeaders);
  const live = new Set(newHeaders);

  // Role match first, then an exact name match, then a case-insensitive one:
  // three cheap rules, each one only firing when the previous found nothing.
  const byRole = new Map<string, string>();
  for (const role of ROLES) {
    const from = before[role];
    const to = after[role];
    if (from && to && from !== to) byRole.set(from, to);
  }
  const caseless = new Map(newHeaders.map((h) => [h.toLowerCase(), h]));

  const renamed: Record<string, string> = {};
  const unmatched: string[] = [];

  const resolve = (token: string): string | null => {
    if (live.has(token)) return token;
    const role = byRole.get(token);
    if (role) return role;
    const same = caseless.get(token.toLowerCase());
    return same ?? null;
  };

  const rewrite = (text: string): string =>
    text.replace(/\{\{\s*([^{}]*?)\s*\}\}/g, (whole, name: string) => {
      if (!name) return whole;
      const target = resolve(name);
      if (!target) {
        if (!unmatched.includes(name)) unmatched.push(name);
        return whole;
      }
      if (target !== name) renamed[name] = target;
      return `{{${target}}}`;
    });

  const elements: CardElement[] = template.elements.map((el) => {
    if (el.kind === "text") return { ...el, template: rewrite(el.template) };
    if (el.kind === "list") return { ...el, itemTemplate: rewrite(el.itemTemplate) };
    if (el.kind === "icon") {
      const target = el.sourceField ? resolve(el.sourceField) : null;
      if (el.sourceField && !target && !unmatched.includes(el.sourceField)) {
        unmatched.push(el.sourceField);
      }
      if (target && target !== el.sourceField) renamed[el.sourceField] = target;
      return target ? { ...el, sourceField: target } : el;
    }
    return el;
  });

  // Row scope is a binding too: a design grouped by "Table" must follow the
  // column, or it silently collapses every group into one.
  let rowScope = template.rowScope;
  if (rowScope?.kind === "per-group") {
    const target = resolve(rowScope.byColumn);
    if (target) {
      if (target !== rowScope.byColumn) renamed[rowScope.byColumn] = target;
      rowScope = { kind: "per-group", byColumn: target };
    } else if (!unmatched.includes(rowScope.byColumn)) {
      unmatched.push(rowScope.byColumn);
    }
  }

  return {
    template: { ...template, elements, ...(rowScope ? { rowScope } : {}) },
    renamed,
    unmatched,
  };
}

/** Tokens in a template that name no column in the given headers. */
export function unboundTokens(template: Template, headers: string[]): string[] {
  const live = new Set(headers);
  const out = new Set<string>();
  for (const el of template.elements) {
    const text = el.kind === "text" ? el.template : el.kind === "list" ? el.itemTemplate : "";
    for (const token of tokensIn(text)) {
      if (!live.has(token)) out.add(token);
    }
    if (el.kind === "icon" && el.sourceField && !live.has(el.sourceField)) out.add(el.sourceField);
  }
  return [...out];
}
