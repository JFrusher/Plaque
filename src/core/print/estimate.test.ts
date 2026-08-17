import { describe, expect, it } from "vitest";
import { estimatePdfBytes, formatBytes } from "./estimate";

const base = { pageCount: 1, fontBytes: [], imageBytes: [], textDraws: 0 };

describe("estimatePdfBytes", () => {
  it("grows with pages, fonts, images and draws", () => {
    const empty = estimatePdfBytes(base);
    expect(estimatePdfBytes({ ...base, pageCount: 20 })).toBeGreaterThan(empty);
    expect(estimatePdfBytes({ ...base, fontBytes: [200_000] })).toBeGreaterThan(empty);
    expect(estimatePdfBytes({ ...base, imageBytes: [500_000] })).toBeGreaterThan(empty);
    expect(estimatePdfBytes({ ...base, textDraws: 1_000 })).toBeGreaterThan(empty);
  });

  it("counts image bytes in full — they are copied, not subsetted", () => {
    const withImage = estimatePdfBytes({ ...base, imageBytes: [1_000_000] });
    expect(withImage).toBeGreaterThan(1_000_000);
    expect(withImage).toBeLessThan(1_100_000);
  });

  it("assumes a font subsets down, so a 2MB face is not a 2MB PDF", () => {
    expect(estimatePdfBytes({ ...base, fontBytes: [2_000_000] })).toBeLessThan(1_000_000);
  });

  it("puts a 150-guest job in the right order of magnitude", () => {
    // 19 sheets, 8 up, two text lines each, one bundled face of ~110KB.
    const bytes = estimatePdfBytes({
      pageCount: 19,
      fontBytes: [110_000],
      imageBytes: [],
      textDraws: 150 * 2,
    });
    expect(bytes).toBeGreaterThan(30_000);
    expect(bytes).toBeLessThan(300_000);
  });
});

describe("formatBytes", () => {
  it("reads like an estimate, not a byte count", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(1_500_000)).toBe("1.4 MB");
  });
});
