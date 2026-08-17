import { useRef, useState } from "react";
import { saveFont } from "../state/blobStore";
import { registerFont } from "../state/fontLoader";
import { saveImage, toSource } from "../state/imageStore";
import { retainPreMigration } from "../state/persist";
import { PROJECT_EXTENSION, fromBase64, parseProject } from "../state/projectFile";
import { saveProjectFile } from "../state/saveProjectFile";
import { usePlaque } from "../state/store";
import styles from "./ProjectButtons.module.css";

/**
 * Save and reopen a whole project as one file.
 *
 * Plaque autosaves into this browser, but that is not a backup and it does not
 * travel. This is how a design moves to another machine, or gets kept before
 * someone presses Clear all data.
 */
export function ProjectButtons() {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await saveProjectFile();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The project could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function open(file: File | undefined) {
    setError(null);
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const parsed = parseProject(text);
      if (!parsed.ok) {
        setError(parsed.reason);
        return;
      }
      const { project, notes, fromVersion } = parsed;
      const s = usePlaque.getState();

      // Migrated: keep the file exactly as it arrived until the user saves a
      // new one, and say what changed rather than changing it quietly.
      if (notes.length > 0) {
        await retainPreMigration({ fileName: file.name, fromVersion, text });
        setNote(
          `"${file.name}" was made by an older Plaque and has been updated: ${notes.join("; ")}. The original file is kept on this device until you next save a project.`,
        );
      }

      // Assets first, so the design never renders against a font it cannot find.
      for (const font of project.fonts) {
        const data = fromBase64(font.data);
        try {
          s.addFont(await registerFont(font.id, font.family, data), font.family, font.name);
          await saveFont({ id: font.id, family: font.family, fileName: font.name, data });
        } catch {
          // Named anyway, so the missing-asset report can say which file to
          // find rather than printing a content hash at the user.
          s.noteAssetName(font.id, font.name);
          setError(`"${font.name}" could not be loaded — relink it below or the export stays blocked.`);
        }
      }
      for (const image of project.images) {
        const stored = {
          id: image.id,
          name: image.name,
          mime: image.mime,
          data: fromBase64(image.data),
          naturalW: image.naturalW,
          naturalH: image.naturalH,
        };
        s.addImage(toSource(stored), stored.name);
        await saveImage(stored);
      }

      s.hydrate({
        card: project.card,
        sheet: project.sheet,
        template: project.template,
        headers: project.headers,
        rows: project.rows,
        rowIds: project.rowIds ?? project.rows.map((_, i) => `r${i}`),
        merged: project.merged ?? {},
        assetNames: { ...s.assetNames, ...(project.assetNames ?? {}) },
        csvIssues: project.csvIssues,
        fileName: project.fileName,
        uploadedIcons: project.uploadedIcons,
        snapEnabled: project.snapEnabled,
        selectedId: null,
        page: 0,
        previewGuestIndex: 0,
        past: [],
        future: [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The project could not be opened.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className={styles.group}>
      <button type="button" className={styles.button} disabled={busy} onClick={() => void save()}>
        Save project
      </button>
      <button
        type="button"
        className={styles.button}
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        Open project
      </button>
      <input
        ref={input}
        type="file"
        accept={`${PROJECT_EXTENSION},application/json`}
        className={styles.hidden}
        onChange={(e) => {
          void open(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
      {note && (
        <output className={styles.note}>
          {note}
          <button type="button" className={styles.dismiss} onClick={() => setNote(null)}>
            OK
          </button>
        </output>
      )}
    </span>
  );
}
