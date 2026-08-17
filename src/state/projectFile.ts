import type { CsvIssue, GuestRow } from "../core/csv/parse";
import type { CardSpec, SheetSpec, Template } from "../core/types";
import type { StoredFont } from "./blobStore";
import type { StoredImage } from "./imageStore";

/**
 * The `.plaque.json` project file — the PRD's "client-side JSON file export".
 *
 * Self-contained on purpose: uploaded fonts and images are carried as base64,
 * so a project moved to another machine still opens with the right typeface and
 * artwork. That makes files large, but a project you cannot reopen elsewhere is
 * not a backup.
 */
export const PROJECT_FORMAT = "plaque-project";
export const PROJECT_VERSION = 1;
export const PROJECT_EXTENSION = ".plaque.json";

export interface ProjectAsset {
  id: string;
  name: string;
  /** base64, no data: prefix. */
  data: string;
}

export interface ProjectFontAsset extends ProjectAsset {
  family: string;
}

export interface ProjectImageAsset extends ProjectAsset {
  mime: "image/png" | "image/jpeg";
  naturalW: number;
  naturalH: number;
}

export interface ProjectFile {
  format: typeof PROJECT_FORMAT;
  version: number;
  savedAt: string;
  card: CardSpec;
  sheet: SheetSpec;
  template: Template;
  headers: string[];
  rows: GuestRow[];
  csvIssues: CsvIssue[];
  fileName: string | null;
  uploadedIcons: Record<string, string>;
  snapEnabled: boolean;
  fonts: ProjectFontAsset[];
  images: ProjectImageAsset[];
}

export type ParsedProject =
  | { ok: true; project: ProjectFile }
  | { ok: false; reason: string };

export function buildProject(input: {
  card: CardSpec;
  sheet: SheetSpec;
  template: Template;
  headers: string[];
  rows: GuestRow[];
  csvIssues: CsvIssue[];
  fileName: string | null;
  uploadedIcons: Record<string, string>;
  snapEnabled: boolean;
  fonts: StoredFont[];
  images: StoredImage[];
}): ProjectFile {
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    savedAt: new Date().toISOString(),
    card: input.card,
    sheet: input.sheet,
    template: input.template,
    headers: input.headers,
    rows: input.rows,
    csvIssues: input.csvIssues,
    fileName: input.fileName,
    uploadedIcons: input.uploadedIcons,
    snapEnabled: input.snapEnabled,
    fonts: input.fonts.map((f) => ({
      id: f.id,
      name: f.fileName,
      family: f.family,
      data: toBase64(f.data),
    })),
    images: input.images.map((i) => ({
      id: i.id,
      name: i.name,
      mime: i.mime,
      naturalW: i.naturalW,
      naturalH: i.naturalH,
      data: toBase64(i.data),
    })),
  };
}

/**
 * Rejects anything it cannot fully understand. A half-loaded project would put
 * the user somewhere they can neither reason about nor undo.
 */
export function parseProject(text: string): ParsedProject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "That file is not valid JSON." };
  }
  if (!isRecord(parsed)) return { ok: false, reason: "That file is not a Plaque project." };
  if (parsed["format"] !== PROJECT_FORMAT) {
    return { ok: false, reason: "That file is not a Plaque project." };
  }
  if (parsed["version"] !== PROJECT_VERSION) {
    return {
      ok: false,
      reason: `That project was saved by a different version of Plaque (v${String(parsed["version"])}).`,
    };
  }
  if (!isRecord(parsed["card"]) || !isRecord(parsed["sheet"]) || !isRecord(parsed["template"])) {
    return { ok: false, reason: "That project file is incomplete." };
  }
  if (!Array.isArray((parsed["template"] as Record<string, unknown>)["elements"])) {
    return { ok: false, reason: "That project file is incomplete." };
  }
  if (!Array.isArray(parsed["rows"]) || !Array.isArray(parsed["headers"])) {
    return { ok: false, reason: "That project file has no guest list." };
  }

  const project = parsed as unknown as ProjectFile;
  project.fonts = Array.isArray(project.fonts) ? project.fonts : [];
  project.images = Array.isArray(project.images) ? project.images : [];
  project.uploadedIcons = isRecord(project.uploadedIcons) ? project.uploadedIcons : {};
  return { ok: true, project };
}

export function projectFileName(fileName: string | null): string {
  const base = (fileName ?? "place-cards").replace(/\.[^.]+$/, "") || "place-cards";
  return `${base}${PROJECT_EXTENSION}`;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  // Chunked: spreading a megabyte-long array into String.fromCharCode blows the
  // argument limit.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
