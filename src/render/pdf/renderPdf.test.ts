import { readFileSync } from "node:fs";
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import { BUNDLED_FONTS } from "../../assets/fonts";
import { parseCsv } from "../../core/csv/parse";
import { buildArtefacts } from "../../core/data/artefacts";
import { paginate } from "../../core/imposition/paginate";
import { loadFont, type LoadedFont } from "../../core/text/measure";
import { defaultCard, defaultSheet, defaultTemplate } from "../../core/template/defaults";
import { makeResolveOptions } from "../../core/template/resolve";
import type { CardSpec, SheetSpec, Template, TextElement } from "../../core/types";
import { mmToPt } from "../../core/units";
import { hexToRgb, renderPdf } from "./renderPdf";

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const fonts = new Map<string, LoadedFont>(
  BUNDLED_FONTS.map((f) => [
    f.id,
    loadFont(f.id, f.family, new Uint8Array(readFileSync(`src/assets/fonts/${f.file}`))),
  ]),
);

const resolveOptions = makeResolveOptions(fonts);

function build(csvPath: string, card: CardSpec, sheet: SheetSpec, template?: Template) {
  const { headers, rows } = parseCsv(readFileSync(csvPath, "utf8"));
  const artefacts = buildArtefacts(rows, { kind: "per-row" }, headers);
  return paginate(template ?? defaultTemplate(headers, card), artefacts, card, sheet, resolveOptions);
}

/** Inflates every FlateDecode stream so the drawing operators can be inspected. */
function contentStreams(bytes: Uint8Array): string[] {
  const buf = Buffer.from(bytes);
  const raw = buf.toString("latin1");
  const out: string[] = [];
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const start = m.index + m[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) continue;
    try {
      out.push(zlib.inflateSync(buf.subarray(start, end)).toString("latin1"));
    } catch {
      out.push(buf.subarray(start, end).toString("latin1"));
    }
  }
  return out;
}

async function openPdf(bytes: Uint8Array) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes) });
  return { task, doc: await task.promise };
}

async function extractText(bytes: Uint8Array, pageNumber: number): Promise<string> {
  const { task, doc } = await openPdf(bytes);
  const content = await (await doc.getPage(pageNumber)).getTextContent();
  const text = content.items.map((i) => ("str" in i ? i.str : "")).join(" ");
  await task.destroy();
  return text;
}

// ---------------------------------------------------------------------------
// The smoke test
// ---------------------------------------------------------------------------

describe("renderPdf — 150 guests, 8 up on A4", () => {
  const card = defaultCard();
  const sheet = defaultSheet();
  const { sheets } = build("fixtures/guests-150.csv", card, sheet);

  it("imposes 150 guests onto 19 pages", async () => {
    const result = await renderPdf({ sheets, fonts });
    expect(result.pageCount).toBe(19);
  });

  it("writes A4 pages at 595.28 x 841.89pt", async () => {
    const { bytes } = await renderPdf({ sheets, fonts });
    const { task, doc } = await openPdf(bytes);
    expect(doc.numPages).toBe(19);
    const view = (await doc.getPage(1)).view;
    expect(view[2]).toBeCloseTo(595.28, 1);
    expect(view[3]).toBeCloseTo(841.89, 1);
    await task.destroy();
  });

  it("puts the first eight guests on page one as real, extractable text", async () => {
    const { bytes } = await renderPdf({ sheets, fonts });
    const text = await extractText(bytes, 1);
    expect(sheets[0]!.cards.map((c) => c.artefactIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);

    const rows = parseCsv(readFileSync("fixtures/guests-150.csv", "utf8")).rows;
    for (const row of rows.slice(0, 8)) {
      expect(text).toContain(`${row["First Name"]} ${row["Last Name"]}`);
    }
  });

  it("carries the ninth guest onto page two, not page one", async () => {
    const { bytes } = await renderPdf({ sheets, fonts });
    expect(await extractText(bytes, 1)).not.toContain("Rafferty");
    expect(await extractText(bytes, 2)).toContain("Rafferty");
  });

  it("embeds ONLY the faces the document draws with, once each", async () => {
    const { bytes } = await renderPdf({ sheets, fonts });
    // Font descriptors live inside compressed object streams, so the raw bytes
    // are not searchable — they have to be inflated first.
    const all = [Buffer.from(bytes).toString("latin1"), ...contentStreams(bytes)].join("\n");
    const descriptors = all.match(/\/FontFile2/g) ?? [];

    const drawn = new Set(
      sheets.flatMap((s) =>
        s.cards.flatMap((c) =>
          c.scene.elements.flatMap((el) =>
            el.kind === "text" && el.lines.length > 0 ? [el.fontId] : [],
          ),
        ),
      ),
    );

    // An exact count, not "at most". The earlier `<= fonts.size` assertion
    // passed while all six bundled faces were being embedded into a
    // single-font document.
    expect(drawn.size).toBeGreaterThan(0);
    expect(drawn.size).toBeLessThan(fonts.size);
    expect(descriptors.length).toBe(drawn.size);
  });

  it("carries no trace of a bundled face it never used", async () => {
    const { bytes } = await renderPdf({ sheets, fonts });
    const all = [Buffer.from(bytes).toString("latin1"), ...contentStreams(bytes)].join("\n");
    for (const unused of ["GreatVibes", "Parisienne", "Marcellus", "Lato"]) {
      expect(all).not.toContain(unused);
    }
  });

  it("subsets rather than embedding whole files", async () => {
    const result = await renderPdf({ sheets, fonts });
    expect(result.notSubset).toEqual([]);
    // The six bundled faces total ~1.4MB. Subsetting must keep the whole
    // 19-page document well under that.
    expect(result.bytes.byteLength).toBeLessThan(600_000);
  });

  it("exports in under three seconds", async () => {
    const started = performance.now();
    const built = build("fixtures/guests-150.csv", card, sheet);
    await renderPdf({ sheets: built.sheets, fonts });
    expect(performance.now() - started).toBeLessThan(3000);
  });
});

// ---------------------------------------------------------------------------
// Drawing details
// ---------------------------------------------------------------------------

describe("renderPdf — drawing", () => {
  it("flips y exactly once: a card at the top of the page draws near the top", async () => {
    const card = defaultCard();
    const sheet = defaultSheet();
    const { sheets } = build("fixtures/guests-5.csv", card, sheet);
    const { bytes } = await renderPdf({ sheets, fonts });
    const ops = contentStreams(bytes).join("\n");
    // First card spans 10..65mm from the page top, i.e. 232..287mm from the
    // bottom. Its cut line must appear at that height in points, not at 28pt.
    const topCutY = mmToPt(297 - 10);
    expect(ops).toMatch(new RegExp(`${topCutY.toFixed(2)}`));
  });

  it("draws fold guides dashed and crop marks solid", async () => {
    const card: CardSpec = {
      ...defaultCard(),
      heightMm: 110,
      fold: "horizontal",
      foldPositionMm: 55,
      invertBackPanel: true,
    };
    const { sheets } = build("fixtures/guests-5.csv", card, defaultSheet());
    const { bytes } = await renderPdf({ sheets, fonts });
    const ops = contentStreams(bytes).join("\n");
    expect(ops).toContain("[3 3] 0 d");
    expect(ops).toContain("[] 0 d");
  });

  it("rotates back-panel text by 180 degrees on a tent card", async () => {
    const card: CardSpec = {
      ...defaultCard(),
      heightMm: 110,
      fold: "horizontal",
      foldPositionMm: 55,
      invertBackPanel: true,
    };
    const base = defaultTemplate(["First Name", "Last Name"], card);
    const nameEl = base.elements[0]!;
    // Two copies of the name: one on each panel.
    const template: Template = {
      backgroundHex: null,
      elements: [
        { ...nameEl, id: "front", y: 70 },
        { ...nameEl, id: "back", y: 20 },
      ],
    };
    const { sheets } = build("fixtures/guests-5.csv", card, defaultSheet(), template);
    const els = sheets[0]!.cards[0]!.scene.elements;
    expect(els.find((e) => e.id === "front")?.rotationDeg).toBe(0);
    expect(els.find((e) => e.id === "back")?.rotationDeg).toBe(180);

    const { bytes } = await renderPdf({ sheets, fonts });
    const ops = contentStreams(bytes).join("\n");
    // A 180 degree text matrix. pdf-lib builds it with Math.cos/Math.sin, so the
    // off-diagonal terms are 1.2e-16 rather than a clean zero.
    expect(ops).toMatch(/-1 -?[\d.e-]+ -?[\d.e-]+ -1 [\d.]+ [\d.]+ Tm/);
  });

  it("draws icons as path operators, never as an image", async () => {
    const { sheets } = build("fixtures/guests-5.csv", defaultCard(), defaultSheet());
    const hasIcon = sheets[0]!.cards.some((c) =>
      c.scene.elements.some((e) => e.kind === "icon" && e.pathD),
    );
    expect(hasIcon).toBe(true);
    const { bytes } = await renderPdf({ sheets, fonts });
    const streams = contentStreams(bytes);
    expect([Buffer.from(bytes).toString("latin1"), ...streams].join("\n")).not.toContain(
      "/Subtype /Image",
    );
    // drawSvgPath folds its y-flip into the scale matrix: `s 0 0 -s 0 0 cm`.
    // That negative fourth term is what makes SVG's y-down path data land the
    // right way up in a y-up PDF, and it is why drawIcon anchors at the box's
    // top-left rather than its bottom-left.
    expect(streams.join("\n")).toMatch(/(\d*\.?\d+) 0 0 -\1 0 0 cm/);
    // Filled paths, not stroked images.
    expect(streams.join("\n")).toMatch(/\bf\b/);
  });

  it("anchors an icon inside its element box", async () => {
    // The bundled path starts at its own (0,0), so the anchor is the box corner.
    const card = defaultCard();
    const { sheets } = build("fixtures/guests-5.csv", card, defaultSheet());
    const icon = sheets[0]!.cards[0]!.scene.elements.find((e) => e.kind === "icon");
    expect(icon).toBeDefined();
    expect(icon!.x).toBeGreaterThanOrEqual(10);
    expect(icon!.y).toBeGreaterThanOrEqual(10);
  });

  it("produces an empty document rather than throwing when there is nothing to print", async () => {
    const result = await renderPdf({ sheets: [], fonts });
    expect(result.pageCount).toBe(0);
    expect(result.bytes.byteLength).toBeGreaterThan(0);
  });

  it("skips a text element whose font was never supplied instead of crashing", async () => {
    const card = defaultCard();
    const base = defaultTemplate(["First Name", "Last Name"], card);
    const template: Template = {
      backgroundHex: null,
      elements: [{ ...(base.elements[0] as TextElement), fontId: "nope" }],
    };
    const { sheets } = build("fixtures/guests-5.csv", card, defaultSheet(), template);
    await expect(renderPdf({ sheets, fonts })).resolves.toBeDefined();
  });
});

describe("printer calibration (S-D2.1)", () => {
  const card = defaultCard();

  it("changes nothing without a calibrated printer", async () => {
    const { sheets } = build("fixtures/guests-5.csv", card, defaultSheet());
    const plain = await renderPdf({ sheets, fonts });
    const explicit = await renderPdf({ sheets, fonts, scale: 1 });
    expect(streamOps(explicit)).toEqual(streamOps(plain));
  });

  it("scales the page CONTENT and leaves the paper size alone", async () => {
    // A driver printing 2% small is cancelled by drawing 2% large. The sheet is
    // still A4 — it is the driver's scaling being undone, not the paper.
    const { sheets } = build("fixtures/guests-5.csv", card, defaultSheet());
    const { bytes } = await renderPdf({ sheets, fonts, scale: 1.02 });
    const { task, doc } = await openPdf(bytes);
    const view = (await doc.getPage(1)).view;
    await task.destroy();
    expect(view[2]).toBeCloseTo(mmToPt(210), 1);
    expect(view[3]).toBeCloseTo(mmToPt(297), 1);

    // Same guests, bigger type: the text is drawn at a scaled size.
    const plain = contentStreams((await renderPdf({ sheets, fonts })).bytes).join("\n");
    const scaled = contentStreams(bytes).join("\n");
    expect(sizesIn(scaled)[0]).toBeCloseTo(sizesIn(plain)[0]! * 1.02, 2);
    expect(await extractText(bytes, 1)).toContain("Charis Smith");
  });

  it("ignores a scale that would distort the print", async () => {
    const { sheets } = build("fixtures/guests-5.csv", card, defaultSheet());
    const plain = streamOps(await renderPdf({ sheets, fonts }));
    for (const bad of [0, -1, Number.NaN]) {
      expect(streamOps(await renderPdf({ sheets, fonts, scale: bad }))).toEqual(plain);
    }
  });
});

describe("slug line (A8)", () => {
  const card = defaultCard();

  it("prints nothing extra when it is off", async () => {
    const { sheets } = build("fixtures/guests-5.csv", card, defaultSheet());
    expect(await extractText((await renderPdf({ sheets, fonts })).bytes, 1)).not.toContain("Plaque ·");
  });

  it("prints the provenance line and its rule on the sheet", async () => {
    const { sheets } = build("fixtures/guests-5.csv", card, defaultSheet());
    const { bytes } = await renderPdf({
      sheets,
      fonts,
      slug: { ruleMm: 100, texts: sheets.map((s) => `Plaque · build cafe0000 · sheet ${s.index + 1}`) },
    });
    const text = await extractText(bytes, 1);
    expect(text).toContain("Plaque · build cafe0000 · sheet 1");
    // The printed rule is what catches a scaling driver on paper.
    expect(text).toContain("100mm");
  });

  it("survives a printer correction rather than being pushed off the sheet", async () => {
    // The slug sits outside the calibration transform: its rule is the probe for
    // the DRIVER's scaling, and a scaled strip 6mm from the edge would be shifted
    // clean off the page by a few percent of correction.
    const { sheets } = build("fixtures/guests-5.csv", card, defaultSheet());
    const { bytes } = await renderPdf({
      sheets,
      fonts,
      scale: 1.05,
      slug: { ruleMm: 100, texts: ["Plaque · slug"] },
    });
    const text = await extractText(bytes, 1);
    expect(text).toContain("Plaque · slug");
    expect(text).toContain("100mm reference");
  });
});

/**
 * Just the drawing operators, with embedded font names blanked.
 *
 * Both parts matter: pdf-lib tags each font subset with a fresh id, and that id
 * is written into the font program itself — so comparing whole inflated streams
 * compares random bytes and fails at random.
 */
function streamOps(result: { bytes: Uint8Array }): string {
  return contentStreams(result.bytes)
    .filter(isTextual)
    .join("\n")
    .split(/\r?\n/)
    .filter((line) => /\b(Tm|Tf|Tj|re|cm|[ml]|S|f)\s*$/.test(line))
    .join("\n")
    .replace(/\/[\w-]+-\d+ /g, "/FONT ");
}

/**
 * Content streams only. `contentStreams` inflates every stream in the file,
 * including the embedded font programs — whose bytes shift with each subset tag
 * and, decoded as latin1, throw up lines that look exactly like drawing
 * operators. Comparing those compares randomness.
 */
function isTextual(stream: string): boolean {
  if (stream.length === 0) return false;
  const printable = stream.replace(/[^\x20-\x7e\r\n\t]/g, "").length;
  return printable / stream.length > 0.95;
}

/** Every `<size> Tf` in drawing order. */
function sizesIn(ops: string): number[] {
  return [...ops.matchAll(/\/[^\s]+ ([\d.]+) Tf/g)].map((m) => Number.parseFloat(m[1]!));
}

describe("hexToRgb", () => {
  it("reads six-digit and three-digit hex", () => {
    expect(hexToRgb("#ff0000")).toMatchObject({ red: 1, green: 0, blue: 0 });
    expect(hexToRgb("#0f0")).toMatchObject({ red: 0, green: 1, blue: 0 });
  });

  it("falls back to black on nonsense rather than throwing mid-render", () => {
    expect(hexToRgb("not a colour")).toMatchObject({ red: 0, green: 0, blue: 0 });
  });
});
