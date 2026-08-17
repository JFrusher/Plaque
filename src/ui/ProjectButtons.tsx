import { useRef, useState } from "react";
import { loadFonts, saveFont } from "../state/blobStore";
import { registerFont } from "../state/fontLoader";
import { loadImages, saveImage, toSource } from "../state/imageStore";
import {
  PROJECT_EXTENSION,
  buildProject,
  fromBase64,
  parseProject,
  projectFileName,
} from "../state/projectFile";
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

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const s = usePlaque.getState();
      const project = buildProject({
        card: s.card,
        sheet: s.sheet,
        template: s.template,
        headers: s.headers,
        rows: s.rows,
        csvIssues: s.csvIssues,
        fileName: s.fileName,
        uploadedIcons: s.uploadedIcons,
        snapEnabled: s.snapEnabled,
        fonts: await loadFonts(),
        images: await loadImages(),
      });
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = projectFileName(s.fileName);
      link.click();
      URL.revokeObjectURL(url);
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
      const parsed = parseProject(await file.text());
      if (!parsed.ok) {
        setError(parsed.reason);
        return;
      }
      const { project } = parsed;
      const s = usePlaque.getState();

      // Assets first, so the design never renders against a font it cannot find.
      for (const font of project.fonts) {
        const data = fromBase64(font.data);
        try {
          s.addFont(await registerFont(font.id, font.family, data), font.family);
          await saveFont({ id: font.id, family: font.family, fileName: font.name, data });
        } catch {
          setError(`"${font.name}" could not be loaded; its text will use a bundled font.`);
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
    </span>
  );
}
