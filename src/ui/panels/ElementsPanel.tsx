import { useShallow } from "zustand/react/shallow";
import type { CardElement } from "../../core/types";
import { usePlaque, type NewElementKind } from "../../state/store";
import { Panel } from "../controls";
import styles from "./ElementsPanel.module.css";

const KINDS: Array<{ kind: NewElementKind; label: string }> = [
  { kind: "text", label: "Text" },
  { kind: "icon", label: "Icon" },
  { kind: "rect", label: "Box" },
  { kind: "line", label: "Line" },
  { kind: "image", label: "Image" },
];

export function ElementsPanel() {
  const {
    elements,
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
      selectedId: s.selectedId,
      select: s.select,
      addElement: s.addElement,
      removeElement: s.removeElement,
      duplicateElement: s.duplicateElement,
      raiseElement: s.raiseElement,
      lowerElement: s.lowerElement,
    })),
  );

  // Topmost first, matching what the eye sees on the card.
  const ordered = [...elements].sort((a, b) => b.z - a.z);

  return (
    <Panel title="Elements">
      <div className={styles.add}>
        {KINDS.map((k) => (
          <button key={k.kind} type="button" className={styles.addButton} onClick={() => addElement(k.kind)}>
            + {k.label}
          </button>
        ))}
      </div>

      {ordered.length === 0 ? (
        <p className={styles.empty}>Nothing on the card yet.</p>
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
                <span className={styles.name}>{describe(el)}</span>
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

function describe(el: CardElement): string {
  switch (el.kind) {
    case "text":
      return el.template || "(empty)";
    case "icon":
      return el.sourceField ? `by ${el.sourceField}` : "(no column)";
    case "rect":
      return "box";
    case "line":
      return el.w >= el.h ? "horizontal rule" : "vertical rule";
    case "image":
      return el.imageId ? el.imageId.replace(/^img:/, "").replace(/:\d+$/, "") : "(no image)";
  }
}
