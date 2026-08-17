import { del, get, set } from "idb-keyval";
import type { ResolvedImageSource } from "../core/types";

/**
 * Uploaded images.
 *
 * Stored in IndexedDB alongside uploaded fonts, for the same reason: a photo is
 * far larger than the localStorage quota. Only PNG and JPEG are accepted,
 * because those are the two formats a PDF can embed directly — anything else
 * would have to be re-encoded, and silently re-encoding someone's artwork is a
 * worse outcome than telling them to convert it.
 */
export interface StoredImage {
  id: string;
  name: string;
  mime: "image/png" | "image/jpeg";
  data: Uint8Array;
  naturalW: number;
  naturalH: number;
}

const INDEX_KEY = "plaque.images";
const imageKey = (id: string) => `plaque.image.${id}`;

export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg"] as const;

export function isAcceptedImage(file: File): boolean {
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type);
}

export async function saveImage(image: StoredImage): Promise<void> {
  await set(imageKey(image.id), image);
  const ids = new Set(await listImageIds());
  ids.add(image.id);
  await set(INDEX_KEY, [...ids]);
}

export async function listImageIds(): Promise<string[]> {
  return (await get<string[]>(INDEX_KEY)) ?? [];
}

export async function loadImages(): Promise<StoredImage[]> {
  const ids = await listImageIds();
  const images = await Promise.all(ids.map((id) => get<StoredImage>(imageKey(id))));
  return images.filter((i): i is StoredImage => Boolean(i));
}

export async function deleteImage(id: string): Promise<void> {
  await del(imageKey(id));
  await set(INDEX_KEY, (await listImageIds()).filter((existing) => existing !== id));
}

/** Reads a file's bytes and pixel size, rejecting anything that will not embed. */
export async function readImageFile(file: File): Promise<StoredImage> {
  if (!isAcceptedImage(file)) {
    throw new Error(
      `A PDF can embed PNG and JPEG images. "${file.name}" is ${file.type || "an unknown type"} — convert it first, or use the icon uploader if it is an SVG.`,
    );
  }
  const data = new Uint8Array(await file.arrayBuffer());
  const { width, height } = await measureImage(file);
  return {
    id: `img:${file.name}:${data.byteLength}`,
    name: file.name,
    mime: file.type as StoredImage["mime"],
    data,
    naturalW: width,
    naturalH: height,
  };
}

async function measureImage(file: File): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  }
  // Safari fallback.
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error("That image could not be read."));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Turns a stored image into what the renderers want. The object URL lives as
 * long as the image is loaded; `release` hands it back.
 */
export function toSource(image: StoredImage): ResolvedImageSource {
  return {
    id: image.id,
    url: URL.createObjectURL(new Blob([new Uint8Array(image.data)], { type: image.mime })),
    data: image.data,
    mime: image.mime,
    naturalW: image.naturalW,
    naturalH: image.naturalH,
  };
}

export function release(source: ResolvedImageSource): void {
  URL.revokeObjectURL(source.url);
}
