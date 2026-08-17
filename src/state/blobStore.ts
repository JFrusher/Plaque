import { clear as idbClear, del, get, set } from "idb-keyval";

/**
 * Uploaded font binaries.
 *
 * These go to IndexedDB rather than localStorage because a single OpenType file
 * can be larger than the entire localStorage quota. Everything else about the
 * design lives in localStorage — see persist.
 */
export interface StoredFont {
  id: string;
  family: string;
  fileName: string;
  data: Uint8Array;
}

const INDEX_KEY = "plaque.fonts";
const fontKey = (id: string) => `plaque.font.${id}`;

export async function saveFont(font: StoredFont): Promise<void> {
  await set(fontKey(font.id), font);
  const ids = new Set(await listFontIds());
  ids.add(font.id);
  await set(INDEX_KEY, [...ids]);
}

export async function listFontIds(): Promise<string[]> {
  return (await get<string[]>(INDEX_KEY)) ?? [];
}

export async function loadFonts(): Promise<StoredFont[]> {
  const ids = await listFontIds();
  const fonts = await Promise.all(ids.map((id) => get<StoredFont>(fontKey(id))));
  return fonts.filter((f): f is StoredFont => Boolean(f));
}

export async function deleteFont(id: string): Promise<void> {
  await del(fontKey(id));
  await set(INDEX_KEY, (await listFontIds()).filter((existing) => existing !== id));
}

/** Part of "clear all data" — the other half is persist.clear(). */
export async function clearBlobs(): Promise<void> {
  await idbClear();
}
