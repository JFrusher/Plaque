import { describe, expect, it } from "vitest";
import { BUNDLED_VIEW } from "../../assets/icons";
import { fitIcon } from "./iconFit";

describe("fitIcon", () => {
  it("fills a square box with a square icon", () => {
    const fit = fitIcon({ x: 10, y: 20, w: 8, h: 8 }, BUNDLED_VIEW);
    expect(fit).toMatchObject({ x: 10, y: 20, drawnW: 8, drawnH: 8 });
    expect(fit.scale).toBeCloseTo(8 / 24, 10);
  });

  it("centres a square icon in a wide box without stretching it", () => {
    const fit = fitIcon({ x: 0, y: 0, w: 20, h: 8 }, BUNDLED_VIEW);
    expect(fit.drawnW).toBe(8);
    expect(fit.drawnH).toBe(8);
    expect(fit.x).toBe(6);
    expect(fit.y).toBe(0);
  });

  it("respects a non-square uploaded viewBox", () => {
    const fit = fitIcon({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 100, h: 50 });
    expect(fit.drawnW).toBe(10);
    expect(fit.drawnH).toBe(5);
    expect(fit.y).toBe(2.5);
  });

  it("keeps the artwork inside the box", () => {
    for (const view of [
      { x: 0, y: 0, w: 24, h: 24 },
      { x: -10, y: -10, w: 200, h: 30 },
      { x: 5, y: 5, w: 3, h: 90 },
    ]) {
      const fit = fitIcon({ x: 2, y: 3, w: 12, h: 7 }, view);
      expect(fit.x).toBeGreaterThanOrEqual(2 - 1e-9);
      expect(fit.y).toBeGreaterThanOrEqual(3 - 1e-9);
      expect(fit.x + fit.drawnW).toBeLessThanOrEqual(2 + 12 + 1e-9);
      expect(fit.y + fit.drawnH).toBeLessThanOrEqual(3 + 7 + 1e-9);
    }
  });

  it("draws nothing for a degenerate viewBox rather than dividing by zero", () => {
    expect(fitIcon({ x: 1, y: 2, w: 8, h: 8 }, { x: 0, y: 0, w: 0, h: 24 }).scale).toBe(0);
  });
});
