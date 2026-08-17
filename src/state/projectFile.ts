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
  /** Row identity, so per-row overrides survive the trip to another machine. */
  rowIds?: string[];
  merged?: Record<string, { indexes: number[]; ids: string[]; rows: GuestRow[] }>;
  csvIssues: CsvIssue[];
  fileName: string | null;
  uploadedIcons: Record<string, string>;
  assetNames?: Record<string, string>;
  snapEnabled: boolean;
  fonts: ProjectFontAsset[];
  images: ProjectImageAsset[];
}

export type ParsedProject =
  | { ok: true; project: ProjectFile; notes: string[]; fromVersion: number }
  | { ok: false; reason: string };

/**
 * One entry per historical version, keyed by the version it upgrades FROM.
 * Each returns the note the user sees, so a migration can never happen
 * silently — a file that changed shape without saying so is a file the user
 * cannot trust years later (S-D1.3).
 *
 * Empty until the format first changes. A version with no entry is refused
 * rather than guessed at.
 */
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => string> = {};

export function buildProject(input: {
  card: CardSpec;
  sheet: SheetSpec;
  template: Template;
  headers: string[];
  rows: GuestRow[];
  rowIds?: string[];
  merged?: ProjectFile["merged"];
  csvIssues: CsvIssue[];
  fileName: string | null;
  uploadedIcons: Record<string, string>;
  assetNames?: Record<string, string>;
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
    rowIds: input.rowIds ?? input.rows.map((_, i) => `r${i}`),
    merged: input.merged ?? {},
    assetNames: input.assetNames ?? {},
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

  const version = parsed["version"];
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return { ok: false, reason: "That project file does not say which version it is." };
  }
  // Refuse a newer file by name and number, and change nothing. Guessing at a
  // shape this build has never seen is how a project gets quietly corrupted.
  if (version > PROJECT_VERSION) {
    return {
      ok: false,
      reason: `That project was saved by a newer version of Plaque (project format v${version}; this build reads v${PROJECT_VERSION}). Nothing has been changed — update Plaque to open it.`,
    };
  }

  const notes: string[] = [];
  for (let at = version; at < PROJECT_VERSION; at++) {
    const step = MIGRATIONS[at];
    if (!step) {
      return {
        ok: false,
        reason: `That project is in format v${version} and this build cannot upgrade it to v${PROJECT_VERSION}.`,
      };
    }
    notes.push(step(parsed));
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
  project.version = PROJECT_VERSION;
  project.fonts = Array.isArray(project.fonts) ? project.fonts : [];
  project.images = Array.isArray(project.images) ? project.images : [];
  project.uploadedIcons = isRecord(project.uploadedIcons) ? project.uploadedIcons : {};
  project.assetNames = isRecord(project.assetNames) ? project.assetNames : {};
  project.rowIds = Array.isArray(project.rowIds)
    ? project.rowIds
    : project.rows.map((_, i) => `r${i}`);
  project.merged = isRecord(project.merged) ? project.merged : {};
  return { ok: true, project, notes, fromVersion: version };
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
