import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUNDLED_FONTS } from "../assets/fonts";
import { parseCsv } from "./csv/parse";
import { buildJob } from "./job";
import { defaultCard, defaultSheet, defaultTemplate } from "./template/defaults";
import { makeResolveOptions } from "./template/resolve";
import { loadFont, type LoadedFont } from "./text/measure";
import { renderPdf } from "../render/pdf/renderPdf";

const fonts = new Map<string, LoadedFont>(
  BUNDLED_FONTS.map((f) => [
    f.id,
    loadFont(f.id, f.family, new Uint8Array(readFileSync(`src/assets/fonts/${f.file}`))),
  ]),
);
const resolve = makeResolveOptions(fonts);
const { headers, rows } = parseCsv(readFileSync("fixtures/guests-150.csv", "utf8"));
const card = defaultCard();

const input = (over: Partial<Parameters<typeof buildJob>[0]> = {}) => ({
  template: defaultTemplate(headers, card),
  card,
  sheet: defaultSheet(),
  rows,
  headers,
  resolve,
  ...over,
});

describe("buildJob", () => {
  it("turns rows into imposed sheets", () => {
    const job = buildJob(input());
    expect(job.artefactCount).toBe(rows.length);
    expect(job.sheets.length).toBe(19);
  });

  it("honours row scope, so one job can be a menu instead of a card", () => {
    const template = { ...defaultTemplate(headers, card), rowScope: { kind: "per-group" as const, byColumn: "Table" } };
    const job = buildJob(input({ template }));
    expect(job.artefactCount).toBeLessThan(rows.length);
  });

  it("limits to the first artefacts for a test print", () => {
    expect(buildJob(input({ limit: 2 })).artefactCount).toBe(2);
  });

  it("builds only the requested page range", () => {
    const job = buildJob(input({ pages: { from: 0, to: 0 } }));
    expect(job.sheets).toHaveLength(1);
  });

  it("composes one slug line per sheet, all sharing the build hash", () => {
    const job = buildJob(input());
    expect(job.slugTexts).toHaveLength(job.sheets.length);
    for (const text of job.slugTexts) expect(text).toContain(job.buildHash);
  });

  it("changes the build hash when the job changes, and not otherwise", () => {
    // One input object: `defaultTemplate` mints fresh element ids each call, and
    // a different design is genuinely a different build.
    const same = input();
    expect(buildJob(same).buildHash).toBe(buildJob(same).buildHash);
    expect(buildJob({ ...same, scale: 1.02 }).buildHash).not.toBe(buildJob(same).buildHash);
  });

  it("interleaves duplex pages only when there is a back to print", () => {
    const sheet = { ...defaultSheet(), duplex: true };
    const duplex = { flipEdge: "long" as const };
    // Nothing on the back: printing blank reverses would waste half the run.
    expect(buildJob(input({ sheet, duplex })).sheets).toHaveLength(19);

    const base = defaultTemplate(headers, card);
    const withBack = {
      ...base,
      elements: [...base.elements, { ...base.elements[0]!, id: "back", side: "back" as const }],
    };
    expect(buildJob(input({ sheet, duplex, template: withBack })).sheets).toHaveLength(38);
  });

  it("lands a copied back behind its own front, and moves it by the printer's correction", () => {
    // What the "same design on the back" button produces: every front element
    // repeated at the same CARD coordinates. Imposition mirrors the card SLOT,
    // so card 3's back is behind card 3's front and reads the same way up from
    // the other side of the table.
    const sheet = { ...defaultSheet(), duplex: true };
    const base = defaultTemplate(headers, card);
    const twinned = {
      ...base,
      elements: [
        ...base.elements,
        ...base.elements.map((el, i) => ({ ...el, id: `back-${i}`, side: "back" as const })),
      ],
    };

    const job = buildJob(input({ sheet, template: twinned, duplex: { flipEdge: "long" as const } }));
    const [front, back] = [job.sheets[0]!, job.sheets[1]!];
    const W = front.pageWidthMm;

    expect(back.cards).toHaveLength(front.cards.length);
    for (const [i, f] of front.cards.entries()) {
      const b = back.cards[i]!;
      // Portrait long-edge flip mirrors x: the back slot is the front slot
      // reflected about the page centreline, which is where it physically lands.
      expect(b.origin.x).toBeCloseTo(W - f.origin.x - f.footprint.w, 6);
      expect(b.origin.y).toBeCloseTo(f.origin.y, 6);

      // Same offsets inside the card, so the twin reads identically.
      const local = (card_: typeof f) =>
        card_.scene.elements.map((el) => [
          Math.round((el.x - card_.origin.x) * 100) / 100,
          Math.round((el.y - card_.origin.y) * 100) / 100,
        ]);
      expect(local(b)).toEqual(local(f));
    }
  });

  it("applies the measured back-side correction to the backs and nothing else", () => {
    const sheet = { ...defaultSheet(), duplex: true };
    const base = defaultTemplate(headers, card);
    const twinned = {
      ...base,
      elements: [...base.elements, { ...base.elements[0]!, id: "twin", side: "back" as const }],
    };
    const at = (dx: number, dy: number) =>
      buildJob(
        input({
          sheet,
          template: twinned,
          duplex: { flipEdge: "long" as const, backOffsetXMm: dx, backOffsetYMm: dy },
        }),
      );

    const plain = at(0, 0);
    const corrected = at(1.5, -0.8);
    expect(corrected.sheets[0]!.cards[0]!.origin).toEqual(plain.sheets[0]!.cards[0]!.origin);
    expect(corrected.sheets[1]!.cards[0]!.origin.x).toBeCloseTo(
      plain.sheets[1]!.cards[0]!.origin.x + 1.5,
      6,
    );
    expect(corrected.sheets[1]!.cards[0]!.origin.y).toBeCloseTo(
      plain.sheets[1]!.cards[0]!.origin.y - 0.8,
      6,
    );
  });
});

describe("the same job builds the same bytes (F4)", () => {
  it("is byte-identical across builds when deterministic", async () => {
    // This is what makes a PDF regression diff meaningful: anything that differs
    // between two runs of one job is a change in Plaque, not in the clock.
    const job = buildJob(input({ pages: { from: 0, to: 1 } }));
    const first = await renderPdf({ sheets: job.sheets, fonts, deterministic: true });
    const second = await renderPdf({ sheets: job.sheets, fonts, deterministic: true });
    expect(Buffer.from(second.bytes).equals(Buffer.from(first.bytes))).toBe(true);
  });

  it("differs when the design differs, so the diff is not blind", async () => {
    const a = buildJob(input({ pages: { from: 0, to: 0 } }));
    const b = buildJob(input({ pages: { from: 0, to: 0 }, card: { ...card, widthMm: 90 } }));
    const first = await renderPdf({ sheets: a.sheets, fonts, deterministic: true });
    const second = await renderPdf({ sheets: b.sheets, fonts, deterministic: true });
    expect(Buffer.from(second.bytes).equals(Buffer.from(first.bytes))).toBe(false);
  });

  it("is dated by default, so a real export is not stamped with the epoch", async () => {
    const job = buildJob(input({ pages: { from: 0, to: 0 } }));
    const dated = await renderPdf({ sheets: job.sheets, fonts });
    expect(Buffer.from(dated.bytes).toString("latin1")).not.toContain("D:19700101");
  });
});
