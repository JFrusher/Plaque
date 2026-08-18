import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { GuestRow } from "../../core/csv/parse";
import { foldSegment } from "../../core/geometry/fold";
import { resolveCard, type ResolveOptions } from "../../core/template/bindings";
import { fitImage, MAX_ZOOM } from "../../core/template/imageFit";
import { snapTargetsFor } from "../../core/template/snap";
import type { LoadedFont } from "../../core/text/measure";
import type { CardSpec, ElementId, Point, Rect, Template } from "../../core/types";
import { ElementView } from "./ElementView";
import { SelectionHandles } from "./SelectionHandles";
import { MOVE_THRESHOLD_MM, useDragElement } from "./useDragElement";
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
  /** The element whose crop is being dragged, if any. */
  cropId?: ElementId | null;
  /** How much bigger than "fits the pane" the card is drawn. 1 is fit. */
  zoom?: number;
  onSelect: (id: ElementId | null) => void;
  /** Records one undo entry for the whole drag. */
  onEditStart: () => void;
  onChange: (id: ElementId, box: Rect) => void;
  /** Pans and zooms the artwork inside a cropped image element. */
  onCrop?: (id: ElementId, patch: { zoom?: number; focusX?: number; focusY?: number }) => void;
  onZoomChange?: (zoom: number) => void;
  /** Double-clicking an image element asks for crop mode. */
  onRequestCrop?: (id: ElementId) => void;
}

/** Matches the sheet pane: past this the card is bigger than any screen use for it. */
export const MAX_VIEW_ZOOM = 8;

/** A gap this long between wheel events means the last gesture ended. */
const IDLE_MS = 400;

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
  cropId = null,
  zoom = 1,
  onSelect,
  onEditStart,
  onChange,
  onCrop,
  onZoomChange,
  onRequestCrop,
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

  // ---- Crop ---------------------------------------------------------------

  const toMm = useCallback((event: { clientX: number; clientY: number }): Point | null => {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }, []);

  /** The artwork as it currently sits, plus the slack a pan has to work with. */
  const crop = useMemo(() => {
    const el = scene.elements.find((e) => e.id === cropId);
    if (!el || el.kind !== "image" || !el.image) return null;
    const box = { x: el.x, y: el.y, w: el.w, h: el.h };
    const focusX = el.focusX ?? 0.5;
    const focusY = el.focusY ?? 0.5;
    const elZoom = el.zoom ?? 1;
    const placed = fitImage(
      box,
      { w: el.image.naturalW, h: el.image.naturalH },
      { fit: el.fit, zoom: elZoom, focusX, focusY },
    );
    return {
      id: el.id,
      box,
      placed,
      url: el.image.url,
      zoom: elZoom,
      focusX,
      focusY,
      // Negative under a cover fit. Zero on an axis with nothing to pan.
      slackX: box.w - placed.drawnW,
      slackY: box.h - placed.drawnH,
    };
  }, [scene.elements, cropId]);

  const cropDrag = useRef<{ from: Point; focusX: number; focusY: number; started: boolean } | null>(
    null,
  );
  /** When the last crop-zoom wheel event landed. See `IDLE_MS`. */
  const lastWheel = useRef(0);

  const beginCrop = useCallback(
    (event: React.PointerEvent) => {
      if (!crop) return;
      const from = toMm(event);
      if (!from) return;
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      cropDrag.current = { from, focusX: crop.focusX, focusY: crop.focusY, started: false };
    },
    [crop, toMm],
  );

  const moveCrop = useCallback(
    (event: React.PointerEvent) => {
      const start = cropDrag.current;
      if (!start || !crop || !onCrop) return;
      const point = toMm(event);
      if (!point) return;
      const dx = point.x - start.from.x;
      const dy = point.y - start.from.y;
      // One undo entry for the whole pan, exactly as a box drag records one.
      if (!start.started) {
        if (Math.hypot(dx, dy) < MOVE_THRESHOLD_MM) return;
        start.started = true;
        onEditStart();
      }
      // The artwork follows the pointer: moving it right means the focal point
      // moves left, by however much slack that axis has.
      const focusX = crop.slackX === 0 ? start.focusX : start.focusX + dx / crop.slackX;
      const focusY = crop.slackY === 0 ? start.focusY : start.focusY + dy / crop.slackY;
      onCrop(crop.id, {
        focusX: Math.min(1, Math.max(0, focusX)),
        focusY: Math.min(1, Math.max(0, focusY)),
      });
    },
    [crop, onCrop, onEditStart, toMm],
  );

  const endCrop = useCallback(() => {
    cropDrag.current = null;
  }, []);

  // ---- View zoom and pan --------------------------------------------------

  const viewportRef = useRef<HTMLDivElement>(null);
  const [panning, setPanning] = useState(false);
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const spaceHeld = useRef(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceHeld.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceHeld.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // A native listener rather than React's onWheel: React attaches wheel events
  // passively, and a passive listener cannot stop the browser zooming the whole
  // page instead of the card.
  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      const step = Math.exp(-event.deltaY / 500);
      if (crop && onCrop) {
        event.preventDefault();
        // One wheel gesture is one undo entry, not one per tick. A run of
        // events closer together than IDLE_MS is treated as the same gesture,
        // which is the only signal a wheel gives that it has finished.
        const now = event.timeStamp;
        if (now - lastWheel.current > IDLE_MS) onEditStart();
        lastWheel.current = now;
        onCrop(crop.id, { zoom: Math.min(MAX_ZOOM, Math.max(1, crop.zoom * step)) });
        return;
      }
      if ((event.ctrlKey || event.metaKey) && onZoomChange) {
        event.preventDefault();
        onZoomChange(Math.min(MAX_VIEW_ZOOM, Math.max(1, zoom * step)));
      }
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [crop, onCrop, onEditStart, onZoomChange, zoom]);

  const beginPan = useCallback((event: React.PointerEvent) => {
    const node = viewportRef.current;
    // Middle button, or space held: the two gestures that mean "move the paper,
    // not the thing on it".
    if (!node || (event.button !== 1 && !spaceHeld.current)) return;
    event.preventDefault();
    node.setPointerCapture(event.pointerId);
    pan.current = { x: event.clientX, y: event.clientY, left: node.scrollLeft, top: node.scrollTop };
    setPanning(true);
  }, []);

  const movePan = useCallback((event: React.PointerEvent) => {
    const node = viewportRef.current;
    const start = pan.current;
    if (!node || !start) return;
    node.scrollLeft = start.left - (event.clientX - start.x);
    node.scrollTop = start.top - (event.clientY - start.y);
  }, []);

  const endPan = useCallback(() => {
    pan.current = null;
    setPanning(false);
  }, []);

  const canvas = (
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
        <g
          key={el.id}
          style={{ cursor: "move" }}
          onPointerDown={(e) => beginMove(e, el.id)}
          onDoubleClick={() => {
            // Only a cropped image has anything to drag inside its box.
            if (el.kind === "image" && el.fit === "cover") onRequestCrop?.(el.id);
          }}
        >
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

      {/* Crop mode: the whole artwork, ghosted, so what is being cut off is
          visible rather than guessed at. */}
      {crop && (
        <g
          onPointerDown={beginCrop}
          onPointerMove={moveCrop}
          onPointerUp={endCrop}
          onPointerCancel={endCrop}
        >
          <image
            href={crop.url}
            x={crop.placed.x}
            y={crop.placed.y}
            width={crop.placed.drawnW}
            height={crop.placed.drawnH}
            opacity={0.35}
            preserveAspectRatio="none"
            style={{ cursor: "grab" }}
          />
          <rect
            x={crop.box.x}
            y={crop.box.y}
            width={crop.box.w}
            height={crop.box.h}
            fill="transparent"
            stroke="var(--accent)"
            strokeWidth={1}
            strokeDasharray="3 2"
            vectorEffect="non-scaling-stroke"
            style={{ cursor: "grab" }}
          />
        </g>
      )}

      {selectionBox && selectedId && !crop && (
        <SelectionHandles id={selectedId} box={selectionBox} mmPerPx={mmPerPx} onBegin={begin} />
      )}
    </svg>
  );

  return (
    <div
      ref={viewportRef}
      className={panning ? `${styles.viewport} ${styles.panning}` : styles.viewport}
      onPointerDown={beginPan}
      onPointerMove={movePan}
      onPointerUp={endPan}
      onPointerCancel={endPan}
    >
      <div
        className={styles.stage}
        style={{
          width: `${zoom * 100}%`,
          aspectRatio: `${card.widthMm + bleed * 2} / ${card.heightMm + bleed * 2}`,
        }}
      >
        {canvas}
      </div>
    </div>
  );
}
