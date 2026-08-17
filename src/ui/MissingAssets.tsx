import { useRef, useState } from "react";
import type { MissingAsset } from "../core/template/assets";
import { matchesAssetId } from "../state/assetId";
import { saveFont } from "../state/blobStore";
import { registerFont } from "../state/fontLoader";
import { readImageFile, saveImage, toSource } from "../state/imageStore";
import { usePlaque } from "../state/store";
import styles from "./MissingAssets.module.css";

export interface MissingAssetsProps {
  missing: MissingAsset[];
}

/**
 * S-D1.4. Every asset the design references and this device does not have, named
 * by the file it came from, each with a relink that verifies the file it is
 * given.
 *
 * One component for fonts and images because the flow is identical and the user
 * does not care which kind broke — they care which file to go and find. Export
 * is blocked while anything is listed here; see ExportBar.
 */
export function MissingAssets({ missing }: MissingAssetsProps) {
  if (missing.length === 0) return null;
  return (
    <ul className={styles.list}>
      {missing.map((asset) => (
        <MissingRow key={asset.id} asset={asset} />
      ))}
    </ul>
  );
}

function MissingRow({ asset }: { asset: MissingAsset }) {
  const name = usePlaque((s) => s.assetNames[asset.id]);
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const label = name ?? asset.id;
  const count = asset.elementIds.length;

  async function relink(file: File | undefined, force = false) {
    if (!file) return;
    setBusy(true);
    setStatus(null);
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      if (!force && !(await matchesAssetId(asset.id, { name: file.name, data }))) {
        // Never silently substituted. A different file may still be the right
        // one — a re-exported crest, say — but the user has to say so.
        setMismatch(file);
        return;
      }
      setMismatch(null);
      if (asset.kind === "image") await relinkImage(asset.id, file);
      // The family comes from the file the user just chose, as it does on a
      // first upload — the old id may be a bare content hash.
      else await relinkFont(asset.id, file.name.replace(/\.[^.]+$/, ""), file.name, data);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "That file could not be read.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={styles.row}>
      <span className={styles.label}>
        <strong>{label}</strong> is missing — used by {count} {count === 1 ? "element" : "elements"}.
      </span>

      {mismatch ? (
        <>
          <span className={styles.mismatch}>
            "{mismatch.name}" is not the same file as the original.
          </span>
          <button
            type="button"
            className={styles.button}
            disabled={busy}
            onClick={() => void relink(mismatch, true)}
          >
            Use it anyway
          </button>
          <button type="button" className={styles.button} onClick={() => setMismatch(null)}>
            Cancel
          </button>
        </>
      ) : (
        <button
          type="button"
          className={styles.button}
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {busy ? "Checking…" : "Relink…"}
        </button>
      )}

      <input
        ref={input}
        type="file"
        accept={asset.kind === "image" ? "image/png,image/jpeg" : ".ttf,.otf"}
        className={styles.hidden}
        onChange={(e) => {
          void relink(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {status && <span className={styles.mismatch}>{status}</span>}
    </li>
  );
}

/**
 * Stored under the id the design already references, not the file's own content
 * id: the point is to satisfy the existing reference, and re-pointing every
 * element would be a second edit the user did not ask for.
 */
async function relinkImage(id: string, file: File): Promise<void> {
  const read = await readImageFile(file);
  const stored = { ...read, id, name: file.name };
  usePlaque.getState().addImage(toSource(stored), file.name);
  await saveImage(stored);
}

async function relinkFont(
  id: string,
  family: string,
  fileName: string,
  data: Uint8Array,
): Promise<void> {
  const loaded = await registerFont(id, family, data);
  usePlaque.getState().addFont(loaded, family, fileName);
  await saveFont({ id, family, fileName, data });
}
