import { describe, expect, it } from "vitest";
import { defaultCard, defaultSheet, defaultTemplate } from "../core/template/defaults";
import { HISTORY_LIMIT, pushHistory, snapshot, type Snapshot } from "./history";

const state = (): Snapshot => ({
  card: defaultCard(),
  sheet: defaultSheet(),
  template: defaultTemplate(["First Name", "Last Name"]),
});

describe("snapshot", () => {
  it("copies deeply enough that later edits cannot reach back into it", () => {
    const s = state();
    const snap = snapshot(s);
    s.card.widthMm = 999;
    s.template.elements[0]!.x = 999;
    s.template.elements.push(s.template.elements[0]!);

    expect(snap.card.widthMm).toBe(85);
    expect(snap.template.elements[0]!.x).not.toBe(999);
    expect(snap.template.elements).toHaveLength(1);
  });
});

describe("pushHistory", () => {
  it("appends newest last without mutating the input", () => {
    const past: Snapshot[] = [];
    const next = pushHistory(past, state());
    expect(past).toHaveLength(0);
    expect(next).toHaveLength(1);
  });

  it("drops the oldest entry once the limit is reached", () => {
    let past: Snapshot[] = [];
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) {
      const s = state();
      s.card.widthMm = i;
      past = pushHistory(past, snapshot(s));
    }
    expect(past).toHaveLength(HISTORY_LIMIT);
    expect(past[0]?.card.widthMm).toBe(10);
    expect(past.at(-1)?.card.widthMm).toBe(HISTORY_LIMIT + 9);
  });
});
