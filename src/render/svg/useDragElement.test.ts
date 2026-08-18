import { describe, expect, it } from "vitest";
import { applyDrag, edgesFor, type DragMode } from "./useDragElement";

const box = { x: 10, y: 20, w: 30, h: 40 };

describe("applyDrag", () => {
  it("moves without resizing", () => {
    expect(applyDrag(box, "move", 5, -5)).toEqual({ x: 15, y: 15, w: 30, h: 40 });
  });

  it("drags the east edge outward", () => {
    expect(applyDrag(box, "e", 5, 0)).toEqual({ x: 10, y: 20, w: 35, h: 40 });
  });

  it("drags the west edge without moving the east one", () => {
    const r = applyDrag(box, "w", 5, 0);
    expect(r.x).toBe(15);
    expect(r.x + r.w).toBe(box.x + box.w);
  });

  it("drags the north edge without moving the south one", () => {
    const r = applyDrag(box, "n", 0, 5);
    expect(r.y).toBe(25);
    expect(r.y + r.h).toBe(box.y + box.h);
  });

  it("drags both axes from a corner", () => {
    expect(applyDrag(box, "se", 5, 7)).toEqual({ x: 10, y: 20, w: 35, h: 47 });
    expect(applyDrag(box, "nw", 5, 7)).toEqual({ x: 15, y: 27, w: 25, h: 33 });
  });

  it("leaves the untouched axis alone on an edge handle", () => {
    expect(applyDrag(box, "e", 5, 99)).toMatchObject({ y: 20, h: 40 });
    expect(applyDrag(box, "n", 99, 5)).toMatchObject({ x: 10, w: 30 });
  });
});

describe("applyDrag with the aspect locked", () => {
  it("keeps the box's shape when a corner is dragged", () => {
    const r = applyDrag(box, "se", 5, 7, true);
    expect(r.w / r.h).toBeCloseTo(box.w / box.h, 10);
  });

  it("holds the opposite corner still, as an unlocked drag does", () => {
    const se = applyDrag(box, "se", 5, 7, true);
    expect(se.x).toBe(box.x);
    expect(se.y).toBe(box.y);

    const nw = applyDrag(box, "nw", 5, 7, true);
    expect(nw.x + nw.w).toBeCloseTo(box.x + box.w, 10);
    expect(nw.y + nw.h).toBeCloseTo(box.y + box.h, 10);
  });

  it("follows whichever axis the pointer moved further along, in proportion", () => {
    // 7/40 is a bigger share of the height than 5/30 is of the width, so the
    // height leads and the width is derived from it.
    const led = applyDrag(box, "se", 5, 7, true);
    expect(led.h).toBeCloseTo(47, 10);
    expect(led.w).toBeCloseTo(47 * (box.w / box.h), 10);

    const other = applyDrag(box, "se", 9, 1, true);
    expect(other.w).toBeCloseTo(39, 10);
    expect(other.h).toBeCloseTo(39 / (box.w / box.h), 10);
  });

  it("shrinks as well as grows", () => {
    const r = applyDrag(box, "se", -6, -8, true);
    expect(r.w).toBeLessThan(box.w);
    expect(r.h).toBeLessThan(box.h);
    expect(r.w / r.h).toBeCloseTo(box.w / box.h, 10);
  });

  it("is ignored for a move and for an edge handle, which have no shape to keep", () => {
    expect(applyDrag(box, "move", 5, -5, true)).toEqual(applyDrag(box, "move", 5, -5));
    expect(applyDrag(box, "e", 5, 99, true)).toEqual(applyDrag(box, "e", 5, 99));
  });
});

describe("edgesFor", () => {
  it("maps each handle to the edges it moves", () => {
    expect(edgesFor("nw")).toEqual({ left: true, right: false, top: true, bottom: false });
    expect(edgesFor("se")).toEqual({ left: false, right: true, top: false, bottom: true });
    expect(edgesFor("n")).toEqual({ left: false, right: false, top: true, bottom: false });
    expect(edgesFor("e")).toEqual({ left: false, right: true, top: false, bottom: false });
  });

  it("moves no edges for a plain move", () => {
    expect(edgesFor("move")).toEqual({ left: false, right: false, top: false, bottom: false });
  });

  it("covers every handle", () => {
    const modes: DragMode[] = ["move", "n", "s", "e", "w", "nw", "ne", "sw", "se"];
    for (const mode of modes) expect(() => edgesFor(mode)).not.toThrow();
  });
});
