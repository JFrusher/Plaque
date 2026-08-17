import type { Hex } from "../types";


/**
 * Ink-on-stock contrast (E4).
 *
 * A print-accuracy check that happens to be an accessibility one: pale grey on
 * ivory looks refined on a backlit screen and is unreadable across a candlelit
 * table. The comparison is against the STOCK colour the user chose, never the
 * screen background — that is the whole point.
 */

/** WCAG relative luminance. Standard, and the only widely-agreed model there is. */
export function relativeLuminance(hex: Hex): number {
  const { r, g, b } = toRgb(hex);
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: Hex, b: Hex): number {
  const light = Math.max(relativeLuminance(a), relativeLuminance(b));
  const dark = Math.min(relativeLuminance(a), relativeLuminance(b));
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Thresholds are lower than the screen ones on purpose. Ink on paper has no
 * backlight to flatter it, but it also has no sub-pixel rendering to fight, and
 * print sizes here are large. 4.5 is the point below which a name at arm's
 * length in poor light starts to fail; below 3 it is not really printing.
 */
export const READABLE_RATIO = 4.5;
export const POOR_RATIO = 3;

export type ContrastVerdict = "fine" | "marginal" | "poor";

export function verdictFor(inkHex: Hex, stockHex: Hex): ContrastVerdict {
  const ratio = contrastRatio(inkHex, stockHex);
  if (ratio >= READABLE_RATIO) return "fine";
  return ratio >= POOR_RATIO ? "marginal" : "poor";
}

export function describeContrast(inkHex: Hex, stockHex: Hex): string {
  const ratio = contrastRatio(inkHex, stockHex);
  return `${ratio.toFixed(1)}:1`;
}

/** `#rgb` and `#rrggbb`; anything else is treated as black, as the renderers do. */
function toRgb(hex: Hex): { r: number; g: number; b: number } {
  const value = hex.trim().replace(/^#/, "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  if (!/^[0-9a-f]{6}$/i.test(full)) return { r: 0, g: 0, b: 0 };
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

/**
 * Every element whose ink is too close to the stock it prints on.
 *
 * Pure and template-wide, so the editor, the preflight and any future CLI all
 * report the same thing. `stockHex` is the card background when one is set, and
 * paper white otherwise — the colour the ink will actually sit on.
 */
export interface ContrastIssue {
  elementId: string;
  verdict: Exclude<ContrastVerdict, "fine">;
  inkHex: Hex;
  ratio: string;
}

export function contrastIssues(
  elements: Array<{ id: string; kind: string; colorHex?: Hex }>,
  stockHex: Hex,
): ContrastIssue[] {
  const issues: ContrastIssue[] = [];
  for (const el of elements) {
    // Only ink that carries meaning: text, lists and icons. A decorative rule
    // that is deliberately faint is not a legibility problem.
    if (el.kind !== "text" && el.kind !== "list" && el.kind !== "icon") continue;
    if (!el.colorHex) continue;
    const verdict = verdictFor(el.colorHex, stockHex);
    if (verdict === "fine") continue;
    issues.push({
      elementId: el.id,
      verdict,
      inkHex: el.colorHex,
      ratio: describeContrast(el.colorHex, stockHex),
    });
  }
  return issues;
}

/** Paper white, when the design has no stock colour of its own. */
export const PAPER_WHITE = "#ffffff";
