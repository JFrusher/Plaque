import { describe, expect, it } from "vitest";
import { mmToPt } from "../../core/units";
import { calibrationPdf } from "./calibrationPdf";

async function pageOne(bytes: Uint8Array) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes) });
  const doc = await task.promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  const text = content.items.map((i) => ("str" in i ? i.str : "")).join(" ");
  const view = page.view;
  await task.destroy();
  return { text, view, pageCount: doc.numPages };
}

describe("calibrationPdf", () => {
  it("is one page at the requested paper size", async () => {
    const { view, pageCount } = await pageOne(
      await calibrationPdf({ page: "A4", orientation: "portrait" }),
    );
    expect(pageCount).toBe(1);
    expect(view[2]).toBeCloseTo(mmToPt(210), 1);
    expect(view[3]).toBeCloseTo(mmToPt(297), 1);
  });

  it("explains itself on paper, including the do-not-scale instruction", async () => {
    // This sheet turns up in a drawer months later. It has to be self-describing.
    const { text } = await pageOne(await calibrationPdf({ page: "A4", orientation: "portrait" }));
    expect(text).toContain("Plaque printer calibration");
    expect(text).toContain("fit to page");
    expect(text).toContain("100mm across");
    expect(text).toContain("100mm down");
    expect(text).toContain("50 × 50mm square");
  });

  it("names the printer it was produced for", async () => {
    const { text } = await pageOne(
      await calibrationPdf({ page: "A4", orientation: "portrait", printerName: "Kitchen inkjet" }),
    );
    expect(text).toContain("Kitchen inkjet");
  });

  it("follows the chosen paper and orientation", async () => {
    const { view } = await pageOne(await calibrationPdf({ page: "LETTER", orientation: "landscape" }));
    expect(view[2]).toBeCloseTo(mmToPt(279.4), 1);
    expect(view[3]).toBeCloseTo(mmToPt(215.9), 1);
  });

  it("embeds no font bytes — a broken font must not break the fix for it", async () => {
    const bytes = await calibrationPdf({ page: "A4", orientation: "portrait" });
    // Standard-14 faces are referenced, never embedded, so this stays tiny.
    expect(bytes.byteLength).toBeLessThan(40_000);
  });
});
