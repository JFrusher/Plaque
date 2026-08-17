import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { GuestRow } from "../../core/csv/parse";
import { foldSegment } from "../../core/geometry/fold";
import { resolveCard, type ResolveOptions } from "../../core/template/bindings";
import { snapTargetsFor } from "../../core/template/snap";
import type { LoadedFont } from "../../core/text/measure";
import type { CardSpec, ElementId, Rect, Template } from "../../core/types";
import { ElementView } from "./ElementView";
import { SelectionHandles } from "./SelectionHandles";
import { useDragElement } from "./useDragElement";
import styles from "./CardCanvas.module.css";

export interface CardCanvasProps {
  card: CardSpec;
  template: Template;
  /** The row `{{Column}}` tokens bind to. */
  row: GuestRow;
  /** Every row the artefact covers, for list elements. Defaults to just `row`. */
  rows?: GuestRow[];
  fonts: Map<string, LoadedFont>;
  resolveOptions: ResolveOptions;
  selectedId: ElementId | null;
  snapEnabled: boolean;
  onSelect: (id: ElementId | null) => void;
  /** Records one undo entry for the whole drag. */
  onEditStart: () => void;
  onChange: (id: ElementId, box: Rect) => void;
}

/**
 * The editing surface: ONE card, with real guest data in it.
 *
 * The card is drawn UNFOLDED and un-inverted — both panels upright — because
 * that is how a person designs one. The 180 degree flip that makes the back
 * panel readable from across the table is applied when the sheet is imposed,
 * not while editing, so dragging never fights a mirrored coordinate system.
 *
 * Rendering one card rather than the whole sheet is also what keeps dragging at
 * 60fps with a hundred and fifty guests loaded.
 */
export function CardCanvas({
  card,
  template,
  row,
  rows,
  fonts,
  resolveOptions,
  selectedId,
  snapEnabled,
  onSelect,
  onEditStart,
  onChange,
}: CardCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [mmPerPx, setMmPerPx] = useState(0.2);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const measure = () => {
      const rect = svg.getBoundingClientRect();
      if (rect.width > 0) setMmPerPx(card.widthMm / rect.width);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [card.widthMm]);

  const scene = useMemo(
    // Editing shows the card upright; inversion is an imposition concern.
    () =>
      resolveCard(template, row, { ...card, invertBackPanel: false }, resolveOptions, rows ?? [row])
        .scene,
    [template, row, rows, card, resolveOptions],
  );

  const snapTargets = useMemo(
    () => snapTargetsFor(card, template.elements, selectedId),
    [card, template.elements, selectedId],
  );

  const { drag, begin, move, end } = useDragElement({
    svgRef,
    snapTargets,
    snapEnabled,
    onEditStart,
    onChange,
  });

  const selected = template.elements.find((el) => el.id === selectedId);
  const selectionBox: Rect | null =
    drag && drag.id === selectedId
      ? drag.box
      : selected
        ? { x: selected.x, y: selected.y, w: selected.w, h: selected.h }
        : null;

  const beginMove = useCallback(
    (event: React.PointerEvent, id: ElementId) => {
      const el = template.elements.find((e) => e.id === id);
      if (!el) return;
      onSelect(id);
      begin(event, id, { x: el.x, y: el.y, w: el.w, h: el.h }, "move");
    },
    [begin, onSelect, template.elements],
  );

  const fold = foldSegment(card);
  const bleed = card.bleedMm;

  return (
    <svg
      ref={svgRef}
      className={styles.canvas}
      viewBox={`${-bleed} ${-bleed} ${card.widthMm + bleed * 2} ${card.heightMm + bleed * 2}`}
      preserveAspectRatio="xMidYMid meet"
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerDown={() => onSelect(null)}
    >
      {bleed > 0 && (
        <rect
          x={-bleed}
          y={-bleed}
          width={card.widthMm + bleed * 2}
          height={card.heightMm + bleed * 2}
          fill={template.backgroundHex ?? "#ffffff"}
          opacity={0.5}
        />
      )}
      <rect
        x={0}
        y={0}
        width={card.widthMm}
        height={card.heightMm}
        fill={template.backgroundHex ?? "#ffffff"}
        stroke="var(--border-strong)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />

      {scene.elements.map((el) => (
        <g key={el.id} style={{ cursor: "move" }} onPointerDown={(e) => beginMove(e, el.id)}>
          <ElementView element={el} fonts={fonts} />
          {/* An invisible hit area, so empty space inside a text box is still grabbable. */}
          <rect x={el.x} y={el.y} width={el.w} height={el.h} fill="transparent" />
        </g>
      ))}

      {fold && (
        <line
          x1={fold[0].x}
          y1={fold[0].y}
          x2={fold[1].x}
          y2={fold[1].y}
          stroke="var(--grey-5)"
          strokeWidth={1}
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}

      {drag?.hitXs.map((x) => (
        <line
          key={`sx-${x}`}
          x1={x}
          y1={-bleed}
          x2={x}
          y2={card.heightMm + bleed}
          stroke="var(--accent)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      ))}
      {drag?.hitYs.map((y) => (
        <line
          key={`sy-${y}`}
          x1={-bleed}
          y1={y}
          x2={card.widthMm + bleed}
          y2={y}
          stroke="var(--accent)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      ))}

      {selectionBox && selectedId && (
        <SelectionHandles id={selectedId} box={selectionBox} mmPerPx={mmPerPx} onBegin={begin} />
      )}
    </svg>
  );
}
