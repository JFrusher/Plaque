import { del, get, set } from "idb-keyval";
import type { CsvIssue, GuestRow } from "../core/csv/parse";
import type { CardSpec, SheetSpec, Template } from "../core/types";
import type { Snapshot } from "./history";

/** IndexedDB, via idb-keyval — the same store the font and image blobs use. */
export const STORAGE_KEY = "plaque.autosave";
/** Where the autosave lived before it moved to IndexedDB. Read once, then removed. */
export const LEGACY_STORAGE_KEY = "plaque.v1";
const VERSION = 2;

/**
 * What survives a refresh. Guest data is included deliberately — losing a
 * hundred and fifty names to an accidental tab close is the worst papercut this
 * app could have — and it never leaves the device.
 *
 * Undo history is here too, so a reload does not silently reset the depth of
 * work the user can back out of (S-D1.1). Snapshots hold the design only, never
 * the rows, so fifty of them cost very little.
 *
 * Uploaded font binaries are NOT here. Those are separate keys in the same
 * IndexedDB store — see blobStore.
 */
export interface Persisted {
  version: number;
  /** ISO time of the write. Drives the "restored from 13:42" notice. */
  savedAt: string | null;
  card: CardSpec;
  sheet: SheetSpec;
  template: Template;
  headers: string[];
  rows: GuestRow[];
  /** Row identity and combines, without which per-row overrides lose their anchor. */
  rowIds: string[];
  merged: Record<string, { indexes: number[]; ids: string[]; rows: GuestRow[] }>;
  csvIssues: CsvIssue[];
  fileName: string | null;
  uploadedIcons: Record<string, string>;
  snapEnabled: boolean;
  /** Filenames of uploaded assets, so a lost blob can still be named (S-D1.4). */
  assetNames: Record<string, string>;
  past: Snapshot[];
  future: Snapshot[];
}

export type SaveInput = Omit<Persisted, "version" | "savedAt">;

export type LoadResult =
  | { status: "empty" }
  | { status: "ok"; data: Persisted }
  | { status: "discarded"; reason: string };

/**
 * Reports its own failure rather than swallowing it. A save the user believes
 * happened and did not is the one outcome this file exists to prevent — the
 * caller puts that on screen (S-D1.2).
 */
export type SaveResult = { ok: true } | { ok: false; reason: string };

export async function save(data: SaveInput): Promise<SaveResult> {
  const record: Persisted = { version: VERSION, savedAt: new Date().toISOString(), ...data };
  try {
    await set(STORAGE_KEY, JSON.stringify(record));
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: saveFailureReason(e) };
  }
}

/**
 * Plain language for the three ways a browser refuses a write. The distinction
 * matters because the remedy differs: space can be freed, a private window
 * cannot be talked round.
 */
export function saveFailureReason(e: unknown): string {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "QuotaExceededError") {
    return "This browser has no room left to save Plaque's work.";
  }
  if (name === "SecurityError" || name === "InvalidStateError" || name === "UnknownError") {
    return "This browser is blocking storage — a private window usually is.";
  }
  return e instanceof Error && e.message ? e.message : "This browser refused to save.";
}

/** Reads the autosave, migrating a pre-IndexedDB one on the way through. */
export async function read(): Promise<LoadResult> {
  const stored = await readIdb();
  if (stored) return load(stored);

  // The autosave used to live in localStorage. Migrating it matters: an upgrade
  // that starts the user fresh is exactly the data loss this area prevents.
  const legacy = readLegacy();
  if (!legacy) return { status: "empty" };

  const result = load(legacy);
  if (result.status === "ok") {
    try {
      await set(STORAGE_KEY, JSON.stringify({ ...result.data, version: VERSION }));
      removeLegacy();
    } catch {
      // Migration can wait for the next autosave; the localStorage copy stays
      // put until one succeeds, so nothing is lost by failing here.
    }
  }
  return result;
}

/**
 * Anything unreadable is discarded rather than partially applied. A half-loaded
 * template would put the user in a state they cannot reason about or undo.
 */
export function load(raw: string | null): LoadResult {
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
  const version = parsed["version"];
  if (version !== 1 && version !== VERSION) {
    return {
      status: "discarded",
      reason: "The saved design was made by a different version of Plaque.",
    };
  }

  const bad = firstBadDesignField(parsed);
  if (bad) return { status: "discarded", reason: bad };

  if (!Array.isArray(parsed["rows"]) || !Array.isArray(parsed["headers"])) {
    return { status: "discarded", reason: "The saved guest list could not be read." };
  }

  // v1 predates both fields. History that does not survive validation is
  // dropped rather than discarding the design with it: losing undo depth is a
  // papercut, losing the work is not.
  const data = parsed as unknown as Persisted;
  return {
    status: "ok",
    data: {
      ...data,
      version: VERSION,
      savedAt: typeof data.savedAt === "string" ? data.savedAt : null,
      assetNames: isRecord(parsed["assetNames"])
        ? (parsed["assetNames"] as Record<string, string>)
        : {},
      // Absent in anything written before per-row editing. Positional ids match
      // what buildArtefacts falls back to, so overrides keyed by them still land.
      rowIds: Array.isArray(parsed["rowIds"])
        ? (parsed["rowIds"] as string[])
        : (data.rows ?? []).map((_, i) => `r${i}`),
      merged: isRecord(parsed["merged"]) ? (parsed["merged"] as Persisted["merged"]) : {},
      past: validSnapshots(parsed["past"]),
      future: validSnapshots(parsed["future"]),
    },
  };
}

/**
 * The original text of a project file that had to be migrated, kept so a
 * migration this build got wrong is recoverable (S-D1.3).
 *
 * Cleared when the user next saves a project file — at that point they hold a
 * file in the new format and the old one is superseded. Deliberately NOT
 * cleared by the autosave, which would fire 400ms after opening and throw the
 * safety net away before anyone could look at it.
 */
export const PRE_MIGRATION_KEY = "plaque.premigration";

export interface PreMigration {
  fileName: string;
  fromVersion: number;
  text: string;
}

export async function retainPreMigration(entry: PreMigration): Promise<void> {
  try {
    await set(PRE_MIGRATION_KEY, entry);
  } catch {
    // The project still opened; the user just has no undo of the migration.
  }
}

export async function readPreMigration(): Promise<PreMigration | null> {
  try {
    return (await get<PreMigration>(PRE_MIGRATION_KEY)) ?? null;
  } catch {
    return null;
  }
}

export async function clearPreMigration(): Promise<void> {
  try {
    await del(PRE_MIGRATION_KEY);
  } catch {
    // Nothing to do; it is a copy, not the work.
  }
}

export async function clear(): Promise<void> {
  try {
    await del(STORAGE_KEY);
  } catch {
    // Nothing useful to do; the caller is already wiping in-memory state.
  }
  removeLegacy();
}

/**
 * Returns a message naming the offending field, or null when the design is
 * usable. Shared by the top-level check and every history entry, because an
 * unusable snapshot breaks undo the same way an unusable design breaks load.
 */
function firstBadDesignField(source: Record<string, unknown>): string | null {
  if (!isRecord(source["card"]) || !isRecord(source["sheet"]) || !isRecord(source["template"])) {
    return "The saved design was incomplete.";
  }
  if (!Array.isArray((source["template"] as Record<string, unknown>)["elements"])) {
    return "The saved design was incomplete.";
  }

  // Every geometry field has to be a real, finite number. A string or a NaN in
  // here propagates into the layout maths and produces zero sheets with no
  // error anywhere — a state the user cannot understand or undo out of.
  const badCard = firstBadNumber(source["card"] as Record<string, unknown>, CARD_NUMBERS);
  const badSheet = firstBadNumber(source["sheet"] as Record<string, unknown>, SHEET_NUMBERS);
  if (badCard || badSheet) {
    return `The saved design had an unusable value for "${badCard ?? badSheet}".`;
  }
  return null;
}

function validSnapshots(value: unknown): Snapshot[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is Snapshot => isRecord(entry) && firstBadDesignField(entry) === null,
  );
}

const CARD_NUMBERS = ["widthMm", "heightMm", "foldPositionMm", "bleedMm"] as const;
const SHEET_NUMBERS = [
  "marginTopMm",
  "marginRightMm",
  "marginBottomMm",
  "marginLeftMm",
  "gapXMm",
  "gapYMm",
  "cardRotationDeg",
  "printerMarginMm",
] as const;

function firstBadNumber(source: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value !== "number" || !Number.isFinite(value)) return key;
  }
  return null;
}

async function readIdb(): Promise<string | null> {
  try {
    return (await get<string>(STORAGE_KEY)) ?? null;
  } catch {
    // Private mode, or storage blocked entirely. The legacy read gets a turn.
    return null;
  }
}

function readLegacy(): string | null {
  try {
    return localStorage.getItem(LEGACY_STORAGE_KEY);
  } catch {
    return null;
  }
}

function removeLegacy(): void {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Blocked storage. Nothing to remove that could be read anyway.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
