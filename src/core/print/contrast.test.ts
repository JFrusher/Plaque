import { describe, expect, it } from "vitest";
import { contrastRatio, describeContrast, relativeLuminance, verdictFor } from "./contrast";

describe("relativeLuminance", () => {
  it("matches the ends of the scale", () => {
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 3);
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 3);
  });

  it("reads three-digit hex the same as six", () => {
    expect(relativeLuminance("#fff")).toBeCloseTo(relativeLuminance("#ffffff"), 6);
  });

  it("treats nonsense as black rather than throwing mid-render", () => {
    expect(relativeLuminance("not a colour")).toBeCloseTo(0, 6);
  });
});

describe("contrastRatio", () => {
  it("is 21 for black on white and 1 for a colour on itself", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#8a7f6d", "#8a7f6d")).toBeCloseTo(1, 6);
  });

  it("does not care which way round the two are given", () => {
    expect(contrastRatio("#333", "#eee")).toBeCloseTo(contrastRatio("#eee", "#333"), 6);
  });
});

describe("verdictFor", () => {
  it("passes near-black ink on ivory stock", () => {
    expect(verdictFor("#171613", "#fffdf5")).toBe("fine");
  });

  it("flags pale grey on ivory, which reads fine on a screen and not on paper", () => {
    expect(verdictFor("#b9b2a4", "#fffdf5")).toBe("poor");
  });

  it("calls the middle ground marginal rather than passing or failing it", () => {
    expect(verdictFor("#8a8171", "#fffdf5")).toBe("marginal");
  });

  it("judges against the stock, not against white", () => {
    // Dark ink on dark stock fails even though it would pass on paper white.
    expect(verdictFor("#3a3a3a", "#ffffff")).toBe("fine");
    expect(verdictFor("#3a3a3a", "#2b2b2b")).toBe("poor");
  });
});

describe("describeContrast", () => {
  it("states the ratio plainly", () => {
    expect(describeContrast("#000000", "#ffffff")).toBe("21.0:1");
  });
});
