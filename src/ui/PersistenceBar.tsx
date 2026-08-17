import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { deleteFont } from "../state/blobStore";
import { deleteImage } from "../state/imageStore";
import { saveProjectFile } from "../state/saveProjectFile";
import { usePlaque } from "../state/store";
import styles from "./PersistenceBar.module.css";

/**
 * S-D1.2. Shown for as long as this browser is refusing to save, and not
 * dismissible: a bar the user can wave away is a bar they will wave away, and
 * the next thing that happens is an hour of work disappearing on reload.
 *
 * Nothing has been lost at the point this appears — the edits are all still in
 * memory. It exists so they can be got out to a file before that stops being
 * true.
 */
export function PersistenceBar({ reason, onRetry }: { reason: string; onRetry: () => void }) {
  const { uploadedFontIds, images } = usePlaque(
    useShallow((s) => ({ uploadedFontIds: s.uploadedFontIds, images: s.images })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const uploadCount = uploadedFontIds.length + images.size;

  async function run(work: () => Promise<void>, fallbackMessage: string) {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : fallbackMessage);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Uploaded fonts and images are what fills a browser's quota; the design and
   * the guest list are kilobytes. This is the app's version of "remove old
   * projects" — there is only ever one project here.
   */
  async function freeSpace() {
    const s = usePlaque.getState();
    for (const id of [...s.uploadedFontIds]) {
      await deleteFont(id);
      s.removeFont(id);
    }
    for (const id of [...s.images.keys()]) {
      await deleteImage(id);
      s.removeImage(id);
    }
    setConfirming(false);
    onRetry();
  }

  return (
    <div className={styles.bar} role="alert">
      <strong className={styles.headline}>Not saving — export your project now.</strong>
      <span className={styles.reason}>{reason}</span>

      <button
        type="button"
        className={styles.primary}
        disabled={busy}
        onClick={() => void run(saveProjectFile, "The project could not be saved.")}
      >
        Save project file
      </button>

      {uploadCount > 0 &&
        (confirming ? (
          <>
            <span>
              Delete {uploadCount} uploaded {uploadCount === 1 ? "file" : "files"} to free space?
              The design keeps its layout and falls back to a bundled font.
            </span>
            <button
              type="button"
              className={styles.danger}
              disabled={busy}
              onClick={() => void run(freeSpace, "Those uploads could not be removed.")}
            >
              Delete uploads
            </button>
            <button type="button" className={styles.button} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" className={styles.button} onClick={() => setConfirming(true)}>
            Free space ({uploadCount} uploaded)
          </button>
        ))}

      <button type="button" className={styles.button} disabled={busy} onClick={onRetry}>
        Try saving again
      </button>

      {error && <span className={styles.reason}>{error}</span>}
    </div>
  );
}
