import type { LoadedFont } from "../../core/text/measure";
import type { Sheet } from "../../core/types";
import { ElementView } from "./ElementView";
import { GuidesLayer } from "./GuidesLayer";

export interface SheetPreviewProps {
  sheet: Sheet;
  fonts: Map<string, LoadedFont>;
  className?: string;
}

/**
 * One imposed sheet, read-only, in millimetre user units.
 *
 * The viewBox is the page in millimetres, so nothing here converts anything.
 * Editing happens on CardCanvas, which draws a single card — a sheet of 150
 * guests is never the thing being dragged.
 */
export function SheetPreview({ sheet, fonts, className }: SheetPreviewProps) {
  return (
    <svg
      className={className}
      viewBox={`0 0 ${sheet.pageWidthMm} ${sheet.pageHeightMm}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`Sheet ${sheet.index + 1}, ${sheet.cards.length} cards`}
    >
      <rect
        x={0}
        y={0}
        width={sheet.pageWidthMm}
        height={sheet.pageHeightMm}
        fill="#ffffff"
        stroke="var(--border)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      {sheet.cards.map((card) => (
        <g key={card.artefactIndex}>
          {card.scene.backgroundHex && (
            <rect
              x={card.origin.x}
              y={card.origin.y}
              width={card.footprint.w}
              height={card.footprint.h}
              fill={card.scene.backgroundHex}
            />
          )}
          {card.scene.elements.map((el) => (
            <ElementView key={el.id} element={el} fonts={fonts} />
          ))}
        </g>
      ))}
      <GuidesLayer guides={sheet.guides} />
    </svg>
  );
}
