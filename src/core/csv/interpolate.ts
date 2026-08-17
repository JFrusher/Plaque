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
 *
 * When a token comes out empty it takes ONE adjacent space with it, so
 * "{{First}} {{Last}}" with no surname does not leave a trailing space that
 * shifts centred text off centre. Whitespace the user typed deliberately, and
 * whitespace inside a value, is left exactly as it is — silently rewriting
 * someone's data is not this function's job.
 */
export function interpolate(template: string, row: GuestRow): Interpolated {
  const missing: string[] = [];
  let out = "";
  let cursor = 0;

  for (const match of template.matchAll(TOKEN)) {
    const start = match.index;
    const name = (match[1] ?? "").trim();
    out += template.slice(cursor, start);
    cursor = start + match[0].length;

    if (!name) continue;

    const value = row[name];
    if (value === undefined) {
      if (!missing.includes(name)) missing.push(name);
    }

    if (value) {
      out += value;
      continue;
    }

    // Empty or missing: absorb one space on whichever side it had one, so the
    // gap it leaves behind closes up.
    if (out.endsWith(" ")) {
      out = out.slice(0, -1);
    } else if (template[cursor] === " ") {
      cursor += 1;
    }
  }

  out += template.slice(cursor);
  return { text: out, missing };
}
