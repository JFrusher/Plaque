/**
 * Writes a real PDF from the fixtures so output can be opened in a viewer and
 * printed with a ruler to hand. `npm run sample`.
 *
 * The unit tests assert structure; this is for the checks only eyes and paper
 * can make.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { BUNDLED_FONTS } from "../src/assets/fonts";
import { makeIconLookup } from "../src/assets/icons";
import { parseCsv } from "../src/core/csv/parse";
import { paginate } from "../src/core/imposition/paginate";
import type { FitTextFn } from "../src/core/template/bindings";
import { defaultCard, defaultSheet, defaultTemplate } from "../src/core/template/defaults";
import { fitText } from "../src/core/text/fit";
import { loadFont, type LoadedFont } from "../src/core/text/measure";
import type { CardSpec } from "../src/core/types";
import { renderPdf } from "../src/render/pdf/renderPdf";

const fonts = new Map<string, LoadedFont>(
  BUNDLED_FONTS.map((f) => [
    f.id,
    loadFont(f.id, f.family, new Uint8Array(readFileSync(`src/assets/fonts/${f.file}`))),
  ]),
);

const fitWith: FitTextFn = (el, text) => {
  const font = fonts.get(el.fontId);
  if (!font) return { lines: [text], fontSizePt: el.fontSizePt, overflowed: false };
  return fitText(font, {
    text,
    boxWMm: el.w,
    boxHMm: el.h,
    fontSizePt: el.fontSizePt,
    lineHeight: el.lineHeight,
    letterSpacingMm: el.letterSpacingMm,
    fit: el.fit,
  });
};

async function build(name: string, card: CardSpec, csv: string) {
  const { headers, rows } = parseCsv(readFileSync(csv, "utf8"));
  const started = performance.now();
  const { sheets, warnings } = paginate(defaultTemplate(headers, card), rows, card, defaultSheet(), {
    fitText: fitWith,
    iconPath: makeIconLookup(),
  });
  const { bytes, pageCount, notSubset } = await renderPdf({ sheets, fonts, title: name });
  writeFileSync(`${name}.pdf`, bytes);
  const ms = Math.round(performance.now() - started);
  console.log(
    `${name}.pdf — ${rows.length} guests, ${pageCount} pages, ${Math.round(bytes.byteLength / 1024)}KB, ${ms}ms` +
      (notSubset.length ? ` (not subset: ${notSubset.join(", ")})` : "") +
      (warnings.length ? ` — ${warnings.length} warnings` : ""),
  );
}

await build("sample-flat", defaultCard(), "fixtures/guests-150.csv");
await build(
  "sample-tent",
  { ...defaultCard(), heightMm: 110, fold: "horizontal", foldPositionMm: 55, invertBackPanel: true },
  "fixtures/guests-5.csv",
);
