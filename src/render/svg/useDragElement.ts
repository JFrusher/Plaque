import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import {
  clampBox,
  snapMove,
  snapResize,
  type SnapTargets,
} from "../../core/template/snap";
import type { ElementId, Mm, Point, Rect } from "../../core/types";

export type DragMode = "move" | "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

/** Movement below this is a click, not a drag. */
export const MOVE_THRESHOLD_MM = 0.2;

export interface DragState {
  id: ElementId;
  box: Rect;
  hitXs: Mm[];
  hitYs: Mm[];
}

export interface UseDragOptions {
  svgRef: RefObject<SVGSVGElement | null>;
  snapTargets: SnapTargets;
  snapEnabled: boolean;
  /** Called once as a drag starts, so history records one entry per drag, not per frame. */
  onEditStart: () => void;
  /** Called continuously while dragging. Must not touch undo history. */
  onChange: (id: ElementId, box: Rect) => void;
}

/**
 * Turns pointer events into millimetre boxes.
 *
 * Screen-to-millimetre conversion goes through the SVG's own screen CTM, so it
 * stays correct at any zoom or window size without the hook knowing the scale.
 * Pointer capture means a fast drag that outruns the cursor does not drop.
 */
export function useDragElement({
  svgRef,
  snapTargets,
  snapEnabled,
  onEditStart,
  onChange,
}: UseDragOptions) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const origin = useRef<{ point: Point; box: Rect; mode: DragMode } | null>(null);
  const started = useRef(false);

  const toMm = useCallback(
    (event: { clientX: number; clientY: number }): Point | null => {
      const svg = svgRef.current;
      const ctm = svg?.getScreenCTM();
      if (!svg || !ctm) return null;
      const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
      return { x: p.x, y: p.y };
    },
    [svgRef],
  );

  const begin = useCallback(
    (event: ReactPointerEvent, id: ElementId, box: Rect, mode: DragMode) => {
      const point = toMm(event);
      if (!point) return;
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      origin.current = { point, box, mode };
      // Deliberately NOT calling onEditStart here. A pointerdown that never
      // moves is a selection, not an edit, and recording one would put a no-op
      // entry on the undo stack — so the next Ctrl+Z would appear to do nothing.
      started.current = false;
      setDrag({ id, box, hitXs: [], hitYs: [] });
    },
    [toMm],
  );

  const move = useCallback(
    (event: ReactPointerEvent) => {
      const start = origin.current;
      if (!start || !drag) return;
      const point = toMm(event);
      if (!point) return;

      const dx = point.x - start.point.x;
      const dy = point.y - start.point.y;

      // The first real movement is what counts as the start of an edit, so one
      // drag produces exactly one undo entry.
      if (!started.current) {
        if (Math.hypot(dx, dy) < MOVE_THRESHOLD_MM) return;
        started.current = true;
        onEditStart();
      }

      // Shift locks the aspect. Snapping is skipped while it is held: pulling
      // one edge onto a guide is exactly what would break the shape the user is
      // holding Shift to keep.
      const lockAspect = event.shiftKey;
      const raw = applyDrag(start.box, start.mode, dx, dy, lockAspect);
      const snapped =
        snapEnabled && !lockAspect ? snapFor(raw, start.mode, snapTargets) : noSnap(raw);
      const box = clampBox(snapped.box);
      setDrag({ id: drag.id, box, hitXs: snapped.hitXs, hitYs: snapped.hitYs });
      onChange(drag.id, box);
    },
    [drag, onChange, onEditStart, snapEnabled, snapTargets, toMm],
  );

  const end = useCallback(() => {
    if (!origin.current) return;
    origin.current = null;
    started.current = false;
    setDrag(null);
  }, []);

  return { drag, begin, move, end };
}

function noSnap(box: Rect) {
  return { box, hitXs: [] as Mm[], hitYs: [] as Mm[] };
}

function snapFor(box: Rect, mode: DragMode, targets: SnapTargets) {
  const threshold = 1;
  return mode === "move"
    ? snapMove(box, targets, threshold)
    : snapResize(box, targets, threshold, edgesFor(mode));
}

/**
 * Applies a pointer delta to a box for the given handle.
 *
 * With `lockAspect`, a corner drag keeps the box's shape: whichever axis the
 * pointer moved further along — as a share of that side's own length, so a
 * short side is not permanently outvoted by a long one — leads, and the other
 * follows from the starting aspect. Edge handles ignore it: dragging one edge
 * has no second axis whose shape there is to keep.
 */
export function applyDrag(box: Rect, mode: DragMode, dx: Mm, dy: Mm, lockAspect = false): Rect {
  if (mode === "move") return { ...box, x: box.x + dx, y: box.y + dy };

  const west = mode.includes("w");
  const east = mode.includes("e");
  const north = mode.startsWith("n");
  const south = mode.startsWith("s");

  let w = box.w;
  if (west) w -= dx;
  else if (east) w += dx;

  let h = box.h;
  if (north) h -= dy;
  else if (south) h += dy;

  const corner = (west || east) && (north || south);
  if (lockAspect && corner && box.w > 0 && box.h > 0) {
    const aspect = box.w / box.h;
    if (Math.abs(dx) / box.w >= Math.abs(dy) / box.h) h = w / aspect;
    else w = h * aspect;
  }

  // Derived from the far edge rather than from the delta, so a locked drag
  // that changed a side by more than the pointer moved still leaves the
  // opposite corner where it was.
  return {
    x: west ? box.x + box.w - w : box.x,
    y: north ? box.y + box.h - h : box.y,
    w,
    h,
  };
}

export function edgesFor(mode: DragMode) {
  // "move" contains an "e", so it has to be excluded before any substring test.
  if (mode === "move") return { left: false, right: false, top: false, bottom: false };
  return {
    left: mode.includes("w"),
    right: mode.includes("e"),
    top: mode.startsWith("n"),
    bottom: mode.startsWith("s"),
  };
}
