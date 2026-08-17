import type { CsvIssue, GuestRow } from "../core/csv/parse";
import type { CardSpec, SheetSpec, Template } from "../core/types";

export const STORAGE_KEY = "plaque.v1";
const VERSION = 1;

/**
 * What survives a refresh. Guest data is included deliberately — losing a
 * hundred and fifty names to an accidental tab close is the worst papercut this
 * app could have — and it never leaves the device.
 *
 * Uploaded font binaries are NOT here. A single .otf can exceed the whole
 * localStorage quota on its own; those live in IndexedDB. See blobStore.
 */
export interface Persisted {
  version: number;
  card: CardSpec;
  sheet: SheetSpec;
  template: Template;
  headers: string[];
  rows: GuestRow[];
  csvIssues: CsvIssue[];
  fileName: string | null;
  uploadedIcons: Record<string, string>;
  snapEnabled: boolean;
}

export type LoadResult =
  | { status: "empty" }
  | { status: "ok"; data: Persisted }
  | { status: "discarded"; reason: string };

export function save(data: Omit<Persisted, "version">): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, ...data }));
  } catch (e) {
    // Quota exceeded, or storage blocked in a private window. Losing the
    // autosave is survivable; taking the whole app down over it is not.
    console.warn("Plaque could not save to this browser's storage.", e);
  }
}

/**
 * Anything unreadable is discarded rather than partially applied. A half-loaded
 * template would put the user in a state they cannot reason about or undo.
 */
export function load(raw: string | null = readRaw()): LoadResult {
  if (!raw) return { status: "empty" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "discarded", reason: "The saved design could not be read." };
  }

  if (!isRecord(parsed)) {
    return { status: "discarded", reason: "The saved design could not be read." };
  }
  if (parsed["version"] !== VERSION) {
    return {
      status: "discarded",
      reason: "The saved design was made by a different version of Plaque.",
    };
  }
  if (!isRecord(parsed["card"]) || !isRecord(parsed["sheet"]) || !isRecord(parsed["template"])) {
    return { status: "discarded", reason: "The saved design was incomplete." };
  }
  if (!Array.isArray((parsed["template"] as Record<string, unknown>)["elements"])) {
    return { status: "discarded", reason: "The saved design was incomplete." };
  }

  return { status: "ok", data: parsed as unknown as Persisted };
}

export function clear(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing useful to do; the caller is already wiping in-memory state.
  }
}

function readRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
