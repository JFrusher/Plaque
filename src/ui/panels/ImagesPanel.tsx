import { useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import type { ImageElement } from "../../core/types";
import { boxWithAspect } from "../../core/template/imageFit";
import { deleteImage, readImageFile, release, saveImage, toSource } from "../../state/imageStore";
import { usePlaque } from "../../state/store";
import { Hint, SubGroup } from "../controls";
import styles from "./ImagesPanel.module.css";

/** The box an element is created with, before anyone has touched it. */
const DEFAULT_SIDE_MM = 24;

/**
 * Reshapes a still-default box to the artwork's proportions.
 *
 * Only a box nobody has sized yet: a square default is a placeholder, but any
 * box the user has dragged is a decision, and silently rewriting it would be
 * the app overruling them.
 */
function shapedFor(
  element: ImageElement,
  artwork: { naturalW: number; naturalH: number },
): { x: number; y: number; w: number; h: number } | Record<string, never> {
  const untouched = element.w === DEFAULT_SIDE_MM && element.h === DEFAULT_SIDE_MM;
  if (!untouched || artwork.naturalH <= 0) return {};
  return boxWithAspect(
    { x: element.x, y: element.y, w: element.w, h: element.h },
    artwork.naturalW / artwork.naturalH,
  );
}

/**
 * Uploaded artwork — a monogram, crest or venue mark. The same image goes on
 * every card; per-guest images are not in this version.
 */
export function ImagesPanel() {
  const { images, imageNames, elements, selectedId, addImage, removeImage, updateElement } =
    usePlaque(
      useShallow((s) => ({
        images: s.images,
        imageNames: s.imageNames,
        elements: s.template.elements,
        selectedId: s.selectedId,
        addImage: s.addImage,
        removeImage: s.removeImage,
        updateElement: s.updateElement,
      })),
    );
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = elements.find(
    (el): el is ImageElement => el.kind === "image" && el.id === selectedId,
  );

  async function upload(file: File | undefined) {
    setError(null);
    if (!file) return;
    setBusy(true);
    try {
      const stored = await readImageFile(file);
      const source = toSource(stored);
      addImage(source, stored.name);
      await saveImage(stored);
      // An image element is almost certainly why the user uploaded this.
      if (selected) updateElement(selected.id, { imageId: source.id, ...shapedFor(selected, stored) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "That image could not be read.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const source = images.get(id);
    if (source) release(source);
    removeImage(id);
    await deleteImage(id);
  }

  return (
    <>
      <button
        type="button"
        className={styles.button}
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        {busy ? "Loading…" : "Upload a PNG or JPEG"}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg"
        className={styles.hidden}
        onChange={(e) => {
          void upload(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {error && <p className={styles.error}>{error}</p>}

      <SubGroup title={`Uploaded (${images.size})`}>
      {images.size === 0 ? (
        <Hint>
          Add an Image element to the card, then upload artwork here. The same image appears on
          every card.
        </Hint>
      ) : (
        <ul className={styles.list}>
          {[...images.values()].map((source) => (
            <li key={source.id} className={selected?.imageId === source.id ? styles.active : ""}>
              <img src={source.url} alt="" className={styles.thumb} />
              <span className={styles.name}>{imageNames[source.id] ?? source.id}</span>
              <span className={styles.actions}>
                {selected && (
                    <button
                    type="button"
                    onClick={() =>
                      updateElement(selected.id, {
                        imageId: source.id,
                        ...shapedFor(selected, source),
                      })
                    }
                  >
                    Use
                  </button>
                )}
                <button type="button" onClick={() => void remove(source.id)}>
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {images.size > 0 && !selected && (
        <Hint>Select an image element on the card to assign one of these to it.</Hint>
      )}
      </SubGroup>

      <Hint>
        PNG and JPEG only — those are the two formats a PDF embeds directly. For an SVG, use the
        icon uploader instead.
      </Hint>
    </>
  );
}
