import { loadFonts } from "./blobStore";
import { loadImages } from "./imageStore";
import { clearPreMigration } from "./persist";
import { buildProject, projectFileName } from "./projectFile";
import { usePlaque } from "./store";

/**
 * Writes the whole project out as a download.
 *
 * Shared deliberately: the Save project button and the "not saving" bar have to
 * be the same action. If the bar told the user to export and then exported
 * something less complete, the bar would be a lie at the worst moment.
 *
 * Throws on failure — both callers already show errors.
 */
export async function saveProjectFile(): Promise<void> {
  const s = usePlaque.getState();
  const project = buildProject({
    card: s.card,
    sheet: s.sheet,
    template: s.template,
    headers: s.headers,
    rows: s.rows,
    rowIds: s.rowIds,
    merged: s.merged,
    assetNames: s.assetNames,
    csvIssues: s.csvIssues,
    fileName: s.fileName,
    uploadedIcons: s.uploadedIcons,
    snapEnabled: s.snapEnabled,
    fonts: await loadFonts(),
    images: await loadImages(),
  });

  downloadJson(projectFileName(s.fileName), JSON.stringify(project, null, 2));

  // The user now holds a file in the current format, so a retained
  // pre-migration original has nothing left to protect.
  await clearPreMigration();
}

/** Also used to hand back the pre-migration original of a project file. */
export function downloadJson(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
