import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The three rules that hold the design together (README, discovery §5).
 *
 * They are stated in prose in three places and, until now, enforced nowhere.
 * These are the checks that catch a well-meaning patch breaking one — which the
 * discovery notes call the most likely way this codebase goes wrong.
 *
 * Grep-shaped tests, deliberately. The alternative is a lint rule nobody
 * installs, and the thing being protected is the SHAPE of the code, not a value
 * any unit test could observe.
 */

function filesIn(dir: string, match: RegExp): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return filesIn(path, match);
    return match.test(path) ? [path] : [];
  });
}

const SOURCE = filesIn("src", /\.(ts|tsx)$/).filter((f) => !f.includes(".test."));
const read = (path: string) => readFileSync(path, "utf8");

/**
 * Source with comments stripped. These invariants are about what the code does,
 * and a comment that mentions a forbidden API — including the comment explaining
 * why it is forbidden — is not a violation of anything.
 */
const code = (path: string) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("invariant 1: every stored coordinate is a millimetre", () => {
  it("keeps pixels and points out of core and state", () => {
    // Conversion belongs in a renderer. A `px` or a `pt` in a stored field means
    // two units in the model, and eventually a card that is 3% wrong.
    const offenders: string[] = [];
    for (const file of SOURCE) {
      if (!file.startsWith(join("src", "core")) && !file.startsWith(join("src", "state"))) continue;
      // The units module and the text engine are where points legitimately live:
      // font sizes are points by definition.
      if (file.includes(join("core", "units")) || file.includes(join("core", "text"))) continue;
      for (const match of code(file).matchAll(/\b(\w*)(Px|Pt)\b\s*[:?]/g)) {
        const field = `${match[1]}${match[2]}`;
        // Font sizes are the one honest exception, and they are never geometry.
        if (/fontSize|minFontSize|sizePt|strokeWidthPt|HAIRLINE/i.test(field)) continue;
        offenders.push(`${file}: ${field}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("names geometry fields in millimetres, so the unit is unmissable", () => {
    const types = read(join("src", "core", "types.ts"));
    for (const field of ["widthMm", "heightMm", "bleedMm", "marginTopMm", "gapXMm"]) {
      expect(types).toContain(field);
    }
  });
});

describe("invariant 2: exactly one file flips the y axis", () => {
  /**
   * The flip is the conversion INTO PDF space: millimetres to points, with y
   * measured from the other end of the page. A reflection that stays in
   * millimetres — mirroring a duplex back sheet, say — is not a flip; it leaves
   * the coordinate system exactly as it found it.
   */
  const flipsIntoPdfSpace = (source: string) =>
    /mmToPt\(/.test(source) && /pageHeight\w*\s*-\s*\w*\.?y\b/.test(source);

  it("flips y only in render/pdf/renderPdf.ts", () => {
    const flippers = SOURCE.filter((file) => flipsIntoPdfSpace(code(file)));
    expect(flippers).toEqual([join("src", "render", "pdf", "renderPdf.ts")]);
  });

  it("does it in one function there, not scattered through the file", () => {
    const source = code(join("src", "render", "pdf", "renderPdf.ts"));
    const occurrences = [...source.matchAll(/pageHeightMm\s*-\s*p\.y/g)];
    expect(occurrences).toHaveLength(1);
    expect(source).toContain("function makeToPdf");
  });
});

describe("invariant 3: fitting is decided once, from fontkit metrics", () => {
  it("imports fontkit in exactly one module", () => {
    // Every measurement in the app comes from core/text/measure. A second
    // fontkit consumer is how the preview and the print start disagreeing.
    const importers = SOURCE.filter((file) => /from "fontkit"|require\("fontkit"\)/.test(code(file)));
    expect(importers).toEqual([join("src", "core", "text", "measure.ts")]);
  });

  it("decides sizes and line breaks only in core/text/fit.ts", () => {
    const deciders = SOURCE.filter((file) => /export function fit(Text|Block)\b/.test(read(file)));
    expect(deciders).toEqual([join("src", "core", "text", "fit.ts")]);
  });

  it("keeps the renderers out of the fitting decision", () => {
    // A renderer may LAY OUT what core decided; it may never decide a size.
    for (const file of SOURCE.filter((f) => f.startsWith(join("src", "render")))) {
      const source = read(file);
      expect(source).not.toMatch(/\bfitText\(|\bfitBlock\(/);
      expect(source).not.toMatch(/measureText|getComputedTextLength|getBBox/);
    }
  });

  it("never asks the browser to measure or centre text", () => {
    // text-anchor would hand centring to the browser, which uses the full
    // advance width where core uses ink extent — see core/text/measure.
    const svg = code(join("src", "render", "svg", "ElementView.tsx"));
    expect(svg).not.toContain("text-anchor");
    expect(svg).not.toContain("textAnchor=\"middle\"");
  });
});

describe("invariant 4: core is pure TypeScript", () => {
  it("imports no React and touches no DOM", () => {
    const offenders: string[] = [];
    for (const file of SOURCE.filter((f) => f.startsWith(join("src", "core")))) {
      const source = code(file);
      if (/from "react"|from "react-dom"/.test(source)) offenders.push(`${file}: react`);
      if (/\bdocument\.|\bwindow\.|localStorage|HTMLElement/.test(source)) {
        offenders.push(`${file}: DOM`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("does not reach into state or the renderers", () => {
    const offenders = SOURCE.filter(
      (f) => f.startsWith(join("src", "core")) && /from "\.\.\/\.\.\/(state|render|ui)\//.test(code(f)),
    );
    expect(offenders).toEqual([]);
  });
});

describe("invariant 5: derived state is never persisted", () => {
  it("saves bindings and inputs, not the sheets they produce", () => {
    // Sheets, scenes and artefacts are recomputed from a pure pipeline. Storing
    // them would create a second source of truth that can fall out of sync.
    const persist = code(join("src", "state", "persist.ts"));
    for (const derived of ["sheets:", "scenes:", "artefacts:", "warnings:"]) {
      expect(persist).not.toContain(derived);
    }
  });
});
