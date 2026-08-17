import { useShallow } from "zustand/react/shallow";
import { sideOf } from "../../core/imposition/duplex";
import { ELEMENT_KINDS, describeElement } from "../../core/template/registry";
import { usePlaque } from "../../state/store";
import { CheckboxField, Panel } from "../controls";
import styles from "./ElementsPanel.module.css";

export function ElementsPanel() {
  const {
    elements,
    editingSide,
    setEditingSide,
    duplex,
    setSheet,
    selectedId,
    select,
    addElement,
    removeElement,
    duplicateElement,
    raiseElement,
    lowerElement,
  } = usePlaque(
    useShallow((s) => ({
      elements: s.template.elements,
      editingSide: s.editingSide,
      setEditingSide: s.setEditingSide,
      duplex: s.sheet.duplex,
      setSheet: s.setSheet,
      selectedId: s.selectedId,
      select: s.select,
      addElement: s.addElement,
      removeElement: s.removeElement,
      duplicateElement: s.duplicateElement,
      raiseElement: s.raiseElement,
      lowerElement: s.lowerElement,
    })),
  );

  // One element list, two sides: the panel shows the side being edited so the
  // layer list matches what is on the canvas.
  const onThisSide = elements.filter((el) => sideOf(el) === editingSide);
  // Topmost first, matching what the eye sees on the card.
  const ordered = [...onThisSide].sort((a, b) => b.z - a.z);
  const backCount = elements.length - elements.filter((el) => sideOf(el) === "front").length;

  return (
    <Panel title="Elements">
      <div className={styles.sides}>
        <CheckboxField
          label="Print both sides (duplex)"
          checked={duplex}
          onChange={(next) => setSheet({ duplex: next })}
          hint="Front and back come from one design; the flip edge and back-side alignment live in Print setup."
        />
        {(duplex || backCount > 0) && (
          <div className={styles.sideToggle}>
            {(["front", "back"] as const).map((side) => (
              <button
                key={side}
                type="button"
                className={side === editingSide ? `${styles.sideButton} ${styles.sideActive}` : styles.sideButton}
                onClick={() => setEditingSide(side)}
              >
                {side === "front" ? "Front" : `Back${backCount > 0 ? ` (${backCount})` : ""}`}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={styles.add}>
        {ELEMENT_KINDS.map((k) => (
          <button key={k.kind} type="button" className={styles.addButton} onClick={() => addElement(k.kind)}>
            + {k.label}
          </button>
        ))}
      </div>

      {ordered.length === 0 ? (
        <p className={styles.empty}>
          {editingSide === "back" ? "Nothing on the back yet." : "Nothing on the card yet."}
        </p>
      ) : (
        <ul className={styles.list}>
          {ordered.map((el) => (
            <li key={el.id}>
              <button
                type="button"
                className={el.id === selectedId ? `${styles.item} ${styles.active}` : styles.item}
                onClick={() => select(el.id)}
              >
                <span className={styles.kind}>{el.kind}</span>
                <span className={styles.name}>{describeElement(el)}</span>
              </button>
              <span className={styles.actions}>
                <button type="button" title="Bring to front" onClick={() => raiseElement(el.id)}>
                  ↑
                </button>
                <button type="button" title="Send to back" onClick={() => lowerElement(el.id)}>
                  ↓
                </button>
                <button type="button" title="Duplicate" onClick={() => duplicateElement(el.id)}>
                  ⧉
                </button>
                <button type="button" title="Delete" onClick={() => removeElement(el.id)}>
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
