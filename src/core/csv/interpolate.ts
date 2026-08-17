import type { GuestRow } from "./parse";

/** `{{ Column Name }}` — whitespace inside the braces is ignored. */
const TOKEN = /\{\{\s*([^{}]*?)\s*\}\}/g;

/** Every column referenced by a template string, in order, deduplicated. */
export function tokensIn(template: string): string[] {
  const out: string[] = [];
  for (const m of template.matchAll(TOKEN)) {
    const name = m[1] ?? "";
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

export interface Interpolated {
  text: string;
  /** Tokens that named a column this CSV does not have. */
  missing: string[];
}

/**
 * Fills a template from a guest row.
 *
 * An unknown token resolves to an empty string rather than being left on the
 * card as literal `{{Nickname}}` — a stray token printed onto a hundred cards is
 * far worse than a gap. The name is returned in `missing` so the UI can say so.
 */
export function interpolate(template: string, row: GuestRow): Interpolated {
  const missing: string[] = [];
  const text = template.replace(TOKEN, (_match, rawName: string) => {
    const name = rawName.trim();
    if (!name) return "";
    const value = row[name];
    if (value === undefined) {
      if (!missing.includes(name)) missing.push(name);
      return "";
    }
    return value;
  });
  return { text: collapseGaps(text), missing };
}

/**
 * "{{First Name}} {{Last Name}}" with an empty surname would otherwise leave a
 * trailing space, which shifts centred text off centre.
 */
function collapseGaps(text: string): string {
  return text.replace(/[ \t]{2,}/g, " ").trim();
}
