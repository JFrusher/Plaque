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
