import { useState } from "react";
import { clearBlobs } from "../state/blobStore";
import { clear as clearStorage } from "../state/persist";
import { usePlaque } from "../state/store";
import styles from "./ClearDataButton.module.css";

/**
 * NFR-6. Always visible, and it really does wipe everything: the design, the
 * guest list, uploaded fonts and icons, both storage areas.
 */
export function ClearDataButton() {
  const clearAll = usePlaque((s) => s.clearAll);
  const [confirming, setConfirming] = useState(false);

  async function wipe() {
    await clearStorage();
    await clearBlobs();
    clearAll();
    setConfirming(false);
    location.reload();
  }

  if (!confirming) {
    return (
      <button type="button" className={styles.button} onClick={() => setConfirming(true)}>
        Clear all data
      </button>
    );
  }

  return (
    <span className={styles.confirm}>
      <span>Delete the guest list, design and uploads from this device?</span>
      <button type="button" className={styles.danger} onClick={() => void wipe()}>
        Delete everything
      </button>
      <button type="button" className={styles.button} onClick={() => setConfirming(false)}>
        Cancel
      </button>
    </span>
  );
}
