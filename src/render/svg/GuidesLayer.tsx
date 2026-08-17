import type { SheetGuides } from "../../core/types";

/**
 * Crop marks, cut lines, fold guides and bleed boundaries.
 *
 * Strokes use `non-scaling-stroke` so a hairline stays a hairline at any zoom.
 * On paper these are 0.25pt; on screen they only have to be visible, and a
 * quarter-point line at preview scale would be a third of a pixel.
 */
export function GuidesLayer({ guides }: { guides: SheetGuides }) {
  return (
    <g fill="none" vectorEffect="non-scaling-stroke">
      {guides.bleedBoxes.map((b, i) => (
        <rect
          key={`bleed-${i}`}
          x={b.x}
          y={b.y}
          width={b.w}
          height={b.h}
          stroke="var(--accent)"
          strokeWidth={1}
          strokeDasharray="2 3"
          opacity={0.6}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {guides.cutLines.map(([a, b], i) => (
        <line
          key={`cut-${i}`}
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke="var(--grey-5)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {guides.foldGuides.map(([a, b], i) => (
        <line
          key={`fold-${i}`}
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke="var(--grey-6)"
          strokeWidth={1}
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {guides.cropMarks.map(([a, b], i) => (
        <line
          key={`crop-${i}`}
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke="var(--grey-8)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  );
}
