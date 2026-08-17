/**
 * Header guessing. Every column is bindable regardless of what this returns —
 * these are only the pre-filled defaults so the first render is not blank.
 */

export interface FieldGuesses {
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  table: string | null;
  dietary: string | null;
  entree: string | null;
}

type Field = keyof FieldGuesses;

/** Checked in order; the first header that matches a pattern wins that field. */
const PATTERNS: Array<[Field, RegExp]> = [
  ["firstName", /^(first|firstname|forename|givenname|given)$/],
  ["lastName", /^(last|lastname|surname|familyname|family)$/],
  ["fullName", /^(name|fullname|guest|guestname|displayname)$/],
  ["table", /^(table|tableno|tablenumber|tablename|seating|seat)$/],
  ["dietary", /^(dietary|diet|dietaryrequirements|dietaryrequirement|requirements|allergies|allergy|restrictions)$/],
  ["entree", /^(entree|entr[ée]e|main|maincourse|meal|mealchoice|course|food)$/],
];

function normalise(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9é]/g, "");
}

export function guessMapping(headers: string[]): FieldGuesses {
  const guesses: FieldGuesses = {
    firstName: null,
    lastName: null,
    fullName: null,
    table: null,
    dietary: null,
    entree: null,
  };

  for (const header of headers) {
    const key = normalise(header);
    for (const [field, pattern] of PATTERNS) {
      if (guesses[field] === null && pattern.test(key)) {
        guesses[field] = header;
        break;
      }
    }
  }

  return guesses;
}

/**
 * The template string a fresh card starts with: whichever name columns exist,
 * falling back to the first column so something always renders.
 */
export function defaultNameTemplate(headers: string[]): string {
  const g = guessMapping(headers);
  if (g.firstName && g.lastName) return `{{${g.firstName}}} {{${g.lastName}}}`;
  if (g.fullName) return `{{${g.fullName}}}`;
  if (g.firstName) return `{{${g.firstName}}}`;
  const first = headers[0];
  return first ? `{{${first}}}` : "";
}
