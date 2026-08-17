import type { PointerEvent as ReactPointerEvent } from "react";
import type { ElementId, Mm, Rect } from "../../core/types";
import type { DragMode } from "./useDragElement";

const HANDLES: Array<{ mode: DragMode; fx: number; fy: number; cursor: string }> = [
  { mode: "nw", fx: 0, fy: 0, cursor: "nwse-resize" },
  { mode: "n", fx: 0.5, fy: 0, cursor: "ns-resize" },
  { mode: "ne", fx: 1, fy: 0, cursor: "nesw-resize" },
  { mode: "e", fx: 1, fy: 0.5, cursor: "ew-resize" },
  { mode: "se", fx: 1, fy: 1, cursor: "nwse-resize" },
  { mode: "s", fx: 0.5, fy: 1, cursor: "ns-resize" },
  { mode: "sw", fx: 0, fy: 1, cursor: "nesw-resize" },
  { mode: "w", fx: 0, fy: 0.5, cursor: "ew-resize" },
];

export interface SelectionHandlesProps {
  id: ElementId;
  box: Rect;
  /** Millimetres per screen pixel, so handles stay a constant size on screen. */
  mmPerPx: Mm;
  onBegin: (event: ReactPointerEvent, id: ElementId, box: Rect, mode: DragMode) => void;
}

export function SelectionHandles({ id, box, mmPerPx, onBegin }: SelectionHandlesProps) {
  const size = 8 * mmPerPx;
  const half = size / 2;

  return (
    <g>
      <rect
        x={box.x}
        y={box.y}
        width={box.w}
        height={box.h}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
      {HANDLES.map((h) => (
        <rect
          key={h.mode}
          x={box.x + box.w * h.fx - half}
          y={box.y + box.h * h.fy - half}
          width={size}
          height={size}
          fill="var(--surface)"
          stroke="var(--accent)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          style={{ cursor: h.cursor }}
          onPointerDown={(e) => onBegin(e, id, box, h.mode)}
        />
      ))}
    </g>
  );
}
