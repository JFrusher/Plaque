import { useEffect } from "react";
import { usePlaque } from "./store";

const NUDGE_MM = 1;
const FINE_NUDGE_MM = 0.1;

const ARROWS: Record<string, [number, number] | undefined> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/**
 * Editor shortcuts.
 *
 * Ignored while a form control has focus, so typing a "d" into a text element's
 * content does not duplicate it.
 */
export function useKeyboard(): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isTyping(event.target)) return;

      const state = usePlaque.getState();
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (mod && key === "z") {
        event.preventDefault();
        if (event.shiftKey) state.redo();
        else state.undo();
        return;
      }
      if (mod && key === "y") {
        event.preventDefault();
        state.redo();
        return;
      }

      const id = state.selectedId;
      if (!id) return;

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        state.removeElement(id);
        return;
      }
      if (mod && key === "d") {
        event.preventDefault();
        state.duplicateElement(id);
        return;
      }
      if (event.key === "Escape") {
        state.select(null);
        return;
      }

      const delta = ARROWS[event.key];
      if (!delta) return;
      event.preventDefault();
      const element = state.template.elements.find((el) => el.id === id);
      if (!element) return;
      const step = event.shiftKey ? FINE_NUDGE_MM : NUDGE_MM;
      state.updateElement(id, {
        x: round(element.x + delta[0] * step),
        y: round(element.y + delta[1] * step),
      });
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function round(mm: number): number {
  return Math.round(mm * 100) / 100;
}
