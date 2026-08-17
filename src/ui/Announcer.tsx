import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import type { CardElement } from "../core/types";
import { usePlaque } from "../state/store";
import styles from "./Announcer.module.css";

const SHORTCUTS: Array<[string, string]> = [
  ["Tab / Shift+Tab", "Move through the elements on this side"],
  ["Arrows", "Nudge 0.5mm"],
  ["Shift + arrows", "Nudge 5mm"],
  ["Alt while dragging", "Ignore the snap guides"],
  ["[ / ]", "Send backwards / bring forwards"],
  ["Ctrl+D", "Duplicate"],
  ["Delete", "Remove"],
  ["Ctrl+Z / Ctrl+Shift+Z", "Undo / redo"],
  ["Escape", "Deselect"],
  ["?", "This list"],
];

/**
 * The keyboard half of the editor (E3, discovery "accessibility").
 *
 * Two jobs, both small: say out loud what is selected and where it is, and show
 * the shortcut sheet on `?`. The numeric inspector is the accessible editor —
 * this is what makes it findable without a mouse.
 */
export function Announcer() {
  const { element, label } = usePlaque(
    useShallow((s) => {
      const el = s.template.elements.find((e) => e.id === s.selectedId);
      return { element: el, label: el ? describe(el) : "" };
    }),
  );
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "?" && !isTyping(event.target)) {
        event.preventDefault();
        setSheetOpen(true);
      }
      if (event.key === "Escape") setSheetOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      {/* Polite: a nudge should not interrupt what a screen reader is saying. */}
      <p className={styles.live} aria-live="polite" aria-atomic="true">
        {element ? label : "Nothing selected"}
      </p>

      {sheetOpen && (
        <div
          className={styles.backdrop}
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard shortcuts"
          onClick={() => setSheetOpen(false)}
        >
          <div className={styles.sheet}>
            <h2 className={styles.title}>Keyboard</h2>
            <dl className={styles.list}>
              {SHORTCUTS.map(([keys, what]) => (
                <div key={keys}>
                  <dt>{keys}</dt>
                  <dd>{what}</dd>
                </div>
              ))}
            </dl>
            <button type="button" className={styles.close} onClick={() => setSheetOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** "Guest name text, 42.5mm from left, 18pt" — position and size, as S-B.2 asks. */
function describe(el: CardElement): string {
  const where = `${round(el.x)}mm from left, ${round(el.y)}mm from top`;
  const size = el.kind === "text" || el.kind === "list" ? `, ${el.fontSizePt}pt` : "";
  const what =
    el.kind === "text"
      ? `${el.template || "empty"} text`
      : el.kind === "list"
        ? "list"
        : el.kind;
  return `${what}, ${where}${size}`;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function round(mm: number): number {
  return Math.round(mm * 10) / 10;
}
