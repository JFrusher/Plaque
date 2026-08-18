import { describe, expect, it } from "vitest";
import { mmToPt } from "../../core/units";
import { duplexTestPdf } from "./duplexTestPdf";

async function read(bytes: Uint8Array) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes) });
  const doc = await task.promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push({
      text: content.items.map((item) => ("str" in item ? item.str : "")).join(" "),
      items: content.items.flatMap((item) =>
        "str" in item ? [{ str: item.str, x: item.transform[4] as number, y: item.transform[5] as number }] : [],
      ),
      view: page.view,
    });
  }
  await task.destroy();
  return { pages, pageCount: doc.numPages };
}

const base = { page: "A4", orientation: "portrait", flipEdge: "long" } as const;

describe("duplexTestPdf", () => {
  it("is two pages of the same paper size — one sheet, both sides", async () => {
    const { pages, pageCount } = await read(await duplexTestPdf(base));
    expect(pageCount).toBe(2);
    for (const page of pages) {
      expect(page.view[2]).toBeCloseTo(mmToPt(210), 1);
      expect(page.view[3]).toBeCloseTo(mmToPt(297), 1);
    }
  });

  it("tells the user how to print it, since a scaled test proves nothing", async () => {
    const { pages } = await read(await duplexTestPdf(base));
    expect(pages[0]?.text).toContain("100%");
    expect(pages[0]?.text).toContain("duplex");
    expect(pages[0]?.text).toContain("long edge");
  });

  it("puts the markers on the front and the numbered scales on the back", async () => {
    const { pages } = await read(await duplexTestPdf(base));
    // Front: crosshair stations, no scale numbers to misread.
    expect(pages[0]?.text).toContain("station A");
    expect(pages[0]?.text).toContain("station B");
    // Back: the scales, labelled per station and per axis.
    expect(pages[1]?.text).toContain("A across");
    expect(pages[1]?.text).toContain("A down");
    expect(pages[1]?.text).toContain("B across");
    expect(pages[1]?.text).toContain("B down");
    expect(pages[1]?.text).toContain("read");
  });

  it("settles the flip edge with one witness mark", async () => {
    const { pages } = await read(await duplexTestPdf(base));
    expect(pages[0]?.text).toContain("witness mark");
    expect(pages[1]?.text).toContain("witness box");
    expect(pages[1]?.text).toContain("other flip edge");
  });

  it("mirrors the witness across the axis the flip edge implies", async () => {
    // Portrait long-edge flip mirrors x, so the witness moves to the far side;
    // short-edge flip mirrors y, so it stays on the same side of the page.
    const witnessOf = (page: { items: { str: string; x: number; y: number }[] }) =>
      page.items.find((i) => i.str === "witness box");

    const long = await read(await duplexTestPdf({ ...base, flipEdge: "long" }));
    const short = await read(await duplexTestPdf({ ...base, flipEdge: "short" }));
    const longWitness = witnessOf(long.pages[1]!)!;
    const shortWitness = witnessOf(short.pages[1]!)!;

    // Long flip mirrors x, so the mark stays at the foot of the page and its box
    // does too; short flip mirrors y and the box lands mid-height instead.
    expect(longWitness.y).toBeLessThan(mmToPt(50));
    expect(shortWitness.y).toBeGreaterThan(mmToPt(100));
    expect(Math.abs(longWitness.y - shortWitness.y)).toBeGreaterThan(mmToPt(50));

    // Whichever way it mirrors, it must clear the instruction band at the head
    // of the page — text printed over the witness box makes it unreadable.
    for (const witness of [longWitness, shortWitness]) {
      expect(witness.y).toBeLessThan(mmToPt(297 - 50));
    }
  });

  it("says when it is already correcting, so a re-test is readable", async () => {
    const { pages } = await read(
      await duplexTestPdf({ ...base, backOffsetXMm: -1.5, backOffsetYMm: 0.5 }),
    );
    expect(pages[1]?.text).toContain("-1.5mm across");
    expect(pages[1]?.text).toContain("0.5mm down");
    expect(pages[1]?.text).toContain("should now read 0");
  });

  it("shifts the back scales by the stored correction", async () => {
    const scaleAt = (page: { items: { str: string; x: number; y: number }[] }) =>
      page.items.find((i) => i.str === "A across")!;
    const plain = await read(await duplexTestPdf(base));
    const shifted = await read(await duplexTestPdf({ ...base, backOffsetXMm: 3 }));
    expect(scaleAt(shifted.pages[1]!).x - scaleAt(plain.pages[1]!).x).toBeCloseTo(mmToPt(3), 1);
  });

  it("warns about skew, which no offset can fix", async () => {
    const { pages } = await read(await duplexTestPdf(base));
    expect(pages[1]?.text).toContain("skewed");
  });
});
