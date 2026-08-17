import { useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { BUNDLED_FONTS } from "../../assets/fonts";
import { assetId } from "../../state/assetId";
import { deleteFont, saveFont } from "../../state/blobStore";
import { registerFont } from "../../state/fontLoader";
import { usePlaque } from "../../state/store";
import { Hint, Panel } from "../controls";
import styles from "./FontsPanel.module.css";

const ACCEPTED = /\.(ttf|otf)$/i;

/** FR-STA-07. Bundled faces plus the user's own .ttf/.otf. */
export function FontsPanel() {
  const { fonts, fontLabels, uploadedFontIds, addFont, removeFont } = usePlaque(
    useShallow((s) => ({
      fonts: s.fonts,
      fontLabels: s.fontLabels,
      uploadedFontIds: s.uploadedFontIds,
      addFont: s.addFont,
      removeFont: s.removeFont,
    })),
  );
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (/\.woff2?$/i.test(file.name)) {
      setError(
        "Web font formats (.woff, .woff2) are compressed for browsers and cannot be embedded in a PDF. Use the .ttf or .otf the font came with.",
      );
      return;
    }
    if (!ACCEPTED.test(file.name)) {
      setError("Fonts have to be .ttf or .otf files.");
      return;
    }

    setBusy(true);
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      // Content-addressed for the same reasons as images — see state/assetId.
      const id = await assetId("user", data);
      const family = file.name.replace(ACCEPTED, "");
      const loaded = await registerFont(id, family, data);
      addFont(loaded, family);
      await saveFont({ id, family, fileName: file.name, data });
    } catch (e) {
      setError(e instanceof Error ? e.message : "That font could not be read.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    removeFont(id);
    await deleteFont(id);
  }

  return (
    <Panel title="Fonts" open={false}>
      <ul className={styles.list}>
        {BUNDLED_FONTS.map((f) => (
          <li key={f.id}>
            <span style={{ fontFamily: `"${f.family}"` }} className={styles.sample}>
              {f.label}
            </span>
            <span className={styles.category}>{f.category}</span>
          </li>
        ))}
        {uploadedFontIds.map((id) => (
          <li key={id}>
            <span style={{ fontFamily: `"${fontLabels[id] ?? id}"` }} className={styles.sample}>
              {fontLabels[id] ?? id}
            </span>
            <button type="button" className={styles.remove} onClick={() => void remove(id)}>
              Remove
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className={styles.button}
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        {busy ? "Loading…" : "Upload a font (.ttf or .otf)"}
      </button>
      <input
        ref={input}
        type="file"
        accept=".ttf,.otf,font/ttf,font/otf"
        className={styles.hidden}
        onChange={(e) => {
          void upload(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {error && <p className={styles.error}>{error}</p>}

      <Hint>
        {fonts.size} {fonts.size === 1 ? "face" : "faces"} available. Uploaded fonts stay on this
        device and are embedded only into the PDFs you generate.
      </Hint>
    </Panel>
  );
}
