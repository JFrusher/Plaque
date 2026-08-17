import { useEffect, useState } from "react";
import styles from "./DesktopGate.module.css";

/** NFR-4. Below this width the editor is not usable, so it is not offered. */
export const MIN_WIDTH_PX = 1024;

export function useIsDesktop(): boolean {
  const [ok, setOk] = useState(() =>
    typeof window === "undefined" ? true : window.innerWidth >= MIN_WIDTH_PX,
  );
  useEffect(() => {
    const query = window.matchMedia(`(min-width: ${MIN_WIDTH_PX}px)`);
    const update = () => setOk(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return ok;
}

export function DesktopGate() {
  return (
    <div className={styles.gate}>
      <h1 className={styles.title}>Plaque needs a bigger screen</h1>
      <p className={styles.body}>
        Designing a place card means dragging things around to a millimetre. That does not work on a
        phone, and a half-working version would waste your card stock rather than save it.
      </p>
      <p className={styles.body}>Open Plaque on a laptop or desktop and it will be here.</p>
    </div>
  );
}
