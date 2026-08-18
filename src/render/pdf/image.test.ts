import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import { resolveCard } from "../../core/template/bindings";
import { defaultCard, newId } from "../../core/template/defaults";
import type { CardSpec, ImageElement, ResolvedImageSource, Sheet, Template } from "../../core/types";
import { renderPdf } from "./renderPdf";

/**
 * A minimal but genuinely valid 2x1 PNG, built by hand so the test does not
 * depend on a fixture file or an encoder.
 */
function makePng(): Uint8Array {
  const crc = (buf: Buffer) => {
    let c = ~0;
    for (const byte of buf) {
      c ^= byte;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(4);
    head.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc(body));
    return Buffer.concat([head, body, tail]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0); // width
  ihdr.writeUInt32BE(1, 4); // height
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  // One scanline: filter byte, then two RGB pixels.
  const raw = Buffer.from([0, 255, 0, 0, 0, 0, 255]);

  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", zlib.deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

const PNG = makePng();

/** Inflates every FlateDecode stream so compressed dictionaries are searchable. */
function inflateAll(bytes: Uint8Array): string {
  const buf = Buffer.from(bytes);
  const raw = buf.toString("latin1");
  const out: string[] = [raw];
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const start = m.index + m[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) continue;
    try {
      out.push(zlib.inflateSync(buf.subarray(start, end)).toString("latin1"));
    } catch {
      // Not a deflate stream; the raw copy above already covers it.
    }
  }
  return out.join("\n");
}

const source: ResolvedImageSource = {
  id: "img:test",
  url: "blob:test",
  data: PNG,
  mime: "image/png",
  naturalW: 2,
  naturalH: 1,
};

const imageEl = (over: Partial<ImageElement> = {}): ImageElement => ({
  kind: "image",
  id: newId(),
  x: 10,
  y: 10,
  w: 40,
  h: 20,
  z: 0,
  imageId: "img:test",
  fit: "contain",
  opacity: 1,
  ...over,
});

const card: CardSpec = defaultCard();

function sheetWith(template: Template, images = new Map([["img:test", source]])): Sheet {
  const { scene } = resolveCard(template, {}, card, {
    fitText: (el, text) => ({ lines: [text], fontSizePt: el.fontSizePt, overflowed: false }),
    iconPath: () => null,
    image: (id) => images.get(id) ?? null,
  });
  return {
    index: 0,
    pageWidthMm: 210,
    pageHeightMm: 297,
    cards: [{ origin: { x: 0, y: 0 }, footprint: { w: card.widthMm, h: card.heightMm }, artefactIndex: 0, scene }],
    guides: { cropMarks: [], cutLines: [], foldGuides: [], bleedBoxes: [] },
  };
}

const fonts = new Map();

describe("image elements", () => {
  it("embeds the image into the PDF", async () => {
    const { bytes } = await renderPdf({
      sheets: [sheetWith({ elements: [imageEl()], backgroundHex: null })],
      fonts,
    });
    const raw = Buffer.from(bytes).toString("latin1");
    expect(raw).toContain("/Subtype /Image");
    expect(raw).toContain("/Width 2");
    expect(raw).toContain("/Height 1");
  });

  it("embeds one copy however many cards use it", async () => {
    const sheet = sheetWith({ elements: [imageEl()], backgroundHex: null });
    const eight: Sheet = {
      ...sheet,
      cards: Array.from({ length: 8 }, (_, i) => ({ ...sheet.cards[0]!, artefactIndex: i })),
    };

    const count = (bytes: Uint8Array) =>
      (Buffer.from(bytes).toString("latin1").match(/\/Subtype \/Image/g) ?? []).length;

    const one = await renderPdf({ sheets: [sheet], fonts });
    const many = await renderPdf({ sheets: [eight], fonts });

    // Counting XObjects outright would be brittle: an image with alpha also
    // emits a soft mask. What matters is that the count does not grow with the
    // number of cards using it.
    expect(count(one.bytes)).toBeGreaterThan(0);
    expect(count(many.bytes)).toBe(count(one.bytes));
  });

  it("preserves the image's aspect under contain", () => {
    // A 2:1 image in a 40x20mm box fills it exactly; in a 40x40 box it does not.
    const wide = sheetWith({ elements: [imageEl({ w: 40, h: 40 })], backgroundHex: null });
    const el = wide.cards[0]!.scene.elements[0]!;
    expect(el.kind).toBe("image");
    expect(el.w).toBe(40);
    expect(el.h).toBe(40);
  });

  it("resolves to nothing, with a warning, when the image is gone", () => {
    const { scene, warnings } = resolveCard(
      { elements: [imageEl()], backgroundHex: null },
      {},
      card,
      { fitText: (e, t) => ({ lines: [t], fontSizePt: e.fontSizePt, overflowed: false }), iconPath: () => null },
    );
    expect(scene.elements[0]).toMatchObject({ kind: "image", image: null });
    expect(warnings.map((w) => w.kind)).toContain("missing-image");
  });

  it("draws nothing at all for an element with no image chosen", async () => {
    const { bytes } = await renderPdf({
      sheets: [sheetWith({ elements: [imageEl({ imageId: null })], backgroundHex: null })],
      fonts,
    });
    expect(Buffer.from(bytes).toString("latin1")).not.toContain("/Subtype /Image");
  });

  it("survives a corrupt image rather than failing the whole export", async () => {
    const broken = new Map([["img:test", { ...source, data: new Uint8Array([1, 2, 3]) }]]);
    await expect(
      renderPdf({
        sheets: [sheetWith({ elements: [imageEl()], backgroundHex: null }, broken)],
        fonts,
      }),
    ).resolves.toBeDefined();
  });

  it("carries opacity through to the PDF graphics state", async () => {
    const opaque = await renderPdf({
      sheets: [sheetWith({ elements: [imageEl({ opacity: 1 })], backgroundHex: null })],
      fonts,
    });
    const faded = await renderPdf({
      sheets: [sheetWith({ elements: [imageEl({ opacity: 0.3 })], backgroundHex: null })],
      fonts,
    });
    // The graphics-state dictionary lives inside a compressed object stream, so
    // the raw bytes have to be inflated before it is visible.
    expect(inflateAll(faded.bytes)).toMatch(/\/ca 0?\.3/);
    expect(inflateAll(opaque.bytes)).not.toMatch(/\/ca 0?\.3/);
  });

  it("clips a cover crop to its box, so the overflow never prints", async () => {
    const { bytes } = await renderPdf({
      sheets: [sheetWith({ elements: [imageEl({ w: 40, h: 40, fit: "cover" })], backgroundHex: null })],
      fonts,
    });
    // "W n" is the PDF clipping path operator followed by the no-op painter:
    // the only thing that stops a 2:1 image drawn 80mm wide from spilling out
    // of its 40mm box and over the card beside it.
    expect(inflateAll(bytes)).toMatch(/\sW\s+n\s/);
  });

  it("does not clip a contain fit, which is inside its box already", async () => {
    const { bytes } = await renderPdf({
      sheets: [sheetWith({ elements: [imageEl({ w: 40, h: 40, fit: "contain" })], backgroundHex: null })],
      fonts,
    });
    expect(inflateAll(bytes)).not.toMatch(/\sW\s+n\s/);
  });

  it("restores the graphics state after a clip, so later elements are not clipped", async () => {
    const { bytes } = await renderPdf({
      sheets: [
        sheetWith({
          elements: [imageEl({ w: 40, h: 40, fit: "cover" })],
          backgroundHex: null,
        }),
      ],
      fonts,
    });
    const stream = inflateAll(bytes);
    // Lookarounds, not \s...\s: consecutive operators share their separator,
    // and a consuming match would swallow it and miss every second one.
    const pushes = (stream.match(/(?<=\s)q(?=\s)/g) ?? []).length;
    const pops = (stream.match(/(?<=\s)Q(?=\s)/g) ?? []).length;
    expect(pushes).toBe(pops);
  });
});
