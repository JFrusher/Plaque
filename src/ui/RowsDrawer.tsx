import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import type { Artefact } from "../core/data/artefacts";
import { hasOverrides } from "../core/template/overrides";
import { usePlaque } from "../state/store";
import styles from "./RowsDrawer.module.css";

export interface RowsDrawerProps {
  artefacts: Artefact[];
  /** 0..1 per artefact, from the analysis pass. Empty until it has run. */
  headroom: number[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

/**
 * D3 and D4: the list of what will be printed, with the fit heatmap over it.
 *
 * Selection is shared with the canvas — clicking a row drives the card preview,
 * so "which row am I looking at" stops being something held in the head.
 *
 * The heatmap is the cheap way to find the six problem names in two thousand:
 * one cell per artefact, coloured by how far its tightest text had to shrink.
 */
export function RowsDrawer({ artefacts, headroom, selectedIndex, onSelect }: RowsDrawerProps) {
  const { rowIds, merged, template, combineRows, splitRow } = usePlaque(
    useShallow((s) => ({
      rowIds: s.rowIds,
      merged: s.merged,
      template: s.template,
      combineRows: s.combineRows,
      splitRow: s.splitRow,
    })),
  );
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<number[]>([]);

  if (artefacts.length === 0) return null;

  const tight = headroom.filter((h) => h < 1).length;
  const overflowing = headroom.filter((h) => h === 0).length;

  const toggle = (index: number) => {
    setPicked((current) =>
      current.includes(index) ? current.filter((i) => i !== index) : [...current, index],
    );
  };

  return (
    <details className={styles.drawer} open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className={styles.summary}>
        <span>
          Rows — {artefacts.length} {artefacts.length === 1 ? "artefact" : "artefacts"}
        </span>
        {/* The strip is visible with the drawer shut: it is the whole point. */}
        <span className={styles.strip} aria-hidden="true">
          {headroom.slice(0, 400).map((value, i) => (
            <i key={i} className={styles.cell} style={{ background: heatColour(value) }} />
          ))}
        </span>
        <span className={styles.counts}>
          {overflowing > 0 && <strong className={styles.bad}>{overflowing} will not fit</strong>}
          {overflowing > 0 && tight > overflowing && " · "}
          {tight > overflowing && `${tight - overflowing} shrunk to fit`}
        </span>
      </summary>

      {picked.length >= 2 && (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.button}
            onClick={() => {
              combineRows(picked.flatMap((i) => artefacts[i]?.rowIndexes ?? []));
              setPicked([]);
            }}
          >
            Combine {picked.length} onto one artefact
          </button>
          <button type="button" className={styles.button} onClick={() => setPicked([])}>
            Clear selection
          </button>
        </div>
      )}

      <ul className={styles.list}>
        {artefacts.map((artefact, index) => {
          const isMerged = Boolean(merged[artefact.rowId]);
          return (
            <li
              key={artefact.key}
              className={index === selectedIndex ? `${styles.row} ${styles.active}` : styles.row}
            >
              <input
                type="checkbox"
                aria-label={`Select ${artefact.label}`}
                checked={picked.includes(index)}
                onChange={() => toggle(index)}
              />
              <button type="button" className={styles.label} onClick={() => onSelect(index)}>
                <i
                  className={styles.dot}
                  style={{ background: heatColour(headroom[index] ?? 1) }}
                  aria-hidden="true"
                />
                {artefact.label}
                {hasOverrides(template, artefact.rowId) && (
                  <span className={styles.tag} title="This row has its own design tweaks">
                    edited
                  </span>
                )}
              </button>
              {isMerged && (
                <button
                  type="button"
                  className={styles.button}
                  onClick={() => splitRow(artefact.rowId)}
                >
                  Split
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {rowIds.length > artefacts.length && (
        <p className={styles.note}>
          {rowIds.length} rows are grouped into {artefacts.length} artefacts.
        </p>
      )}
    </details>
  );
}

/**
 * Green at full size, amber as it shrinks, red when it overflowed. The scale is
 * deliberately blunt — this is a "look here" signal, not a measurement.
 */
function heatColour(headroom: number): string {
  if (headroom <= 0) return "#b3261e";
  if (headroom >= 0.999) return "#c8d6c2";
  if (headroom >= 0.9) return "#e8d9a0";
  return "#e0a458";
}
