import { useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { BUNDLED_ICONS, ICON_VIEWBOX, parseStoredIcon, serialiseIcon } from "../../assets/icons";
import { distinctValues, resolveIconId } from "../../core/template/icons";
import type { IconElement } from "../../core/types";
import { parseSvgIcon } from "../../render/svg/parseSvgIcon";
import { usePlaque } from "../../state/store";
import { Hint, Panel } from "../controls";
import styles from "./IconRulesPanel.module.css";

/**
 * FR-STA-05. Icon rules for ANY column, not only dietary — one row per value
 * actually present in the guest list.
 *
 * A card can carry several icon elements, each reading a different column, so
 * the panel lists them all and says which one it is editing rather than
 * silently following the selection.
 */
export function IconRulesPanel() {
  const {
    elements,
    rows,
    selectedId,
    uploadedIcons,
    select,
    updateElement,
    addUploadedIcon,
    removeUploadedIcon,
  } = usePlaque(
    useShallow((s) => ({
      elements: s.template.elements,
      rows: s.rows,
      selectedId: s.selectedId,
      uploadedIcons: s.uploadedIcons,
      select: s.select,
      updateElement: s.updateElement,
      addUploadedIcon: s.addUploadedIcon,
      removeUploadedIcon: s.removeUploadedIcon,
    })),
  );
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const iconElements = elements.filter((el): el is IconElement => el.kind === "icon");
  const element = iconElements.find((el) => el.id === selectedId) ?? iconElements[0];

  const choices = [
    ...BUNDLED_ICONS.map((i) => ({ id: i.id, label: i.label })),
    ...Object.keys(uploadedIcons).map((id) => ({ id, label: `${id} (yours)` })),
  ];

  async function upload(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!/\.svg$/i.test(file.name)) {
      setError("Icons have to be SVG files.");
      return;
    }
    const parsed = parseSvgIcon(await file.text());
    if (!parsed.ok) {
      setError(parsed.reason);
      return;
    }
    const id = file.name.replace(/\.svg$/i, "");
    addUploadedIcon(id, serialiseIcon(parsed.view, parsed.d));
  }

  return (
    <Panel title="Icon rules" open={false}>
      {!element ? (
        <Hint>
          Add an icon element to the card, then map the values of any column — dietary, entrée,
          anything.
        </Hint>
      ) : (
        <>
          {iconElements.length > 1 && (
            <div className={styles.switcher}>
              {iconElements.map((el) => (
                <button
                  key={el.id}
                  type="button"
                  className={el.id === element.id ? styles.tabActive : styles.tab}
                  onClick={() => select(el.id)}
                >
                  {el.sourceField || "no column"}
                </button>
              ))}
            </div>
          )}

          <Hint>
            {iconElements.length > 1 ? "Editing the icon reading " : "Reading "}
            <strong>{element.sourceField || "no column yet"}</strong>. Values with no icon print
            nothing. Change the column in Selected element.
          </Hint>

          <ul className={styles.rules}>
            {distinctValues(rows, element.sourceField).map((value) => {
              const current = resolveIconId(value, element.rules, element.fallbackIconId);
              return (
                <li key={value} className={styles.rule}>
                  <span className={styles.value} title={value}>
                    {value}
                  </span>
                  <IconPreview id={current} uploaded={uploadedIcons} />
                  <select
                    className={styles.select}
                    value={current ?? ""}
                    onChange={(e) => {
                      const iconId = e.target.value;
                      const rules = element.rules.filter(
                        (r) => r.match.trim().toLowerCase() !== value.trim().toLowerCase(),
                      );
                      updateElement(element.id, {
                        rules: iconId ? [...rules, { match: value, iconId }] : rules,
                      });
                    }}
                  >
                    <option value="">No icon</option>
                    {choices.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>

          {rows.length === 0 && <Hint>Upload a guest list to see that column's values here.</Hint>}
        </>
      )}

      <div className={styles.uploadRow}>
        <button type="button" className={styles.button} onClick={() => input.current?.click()}>
          Upload an SVG icon
        </button>
        <input
          ref={input}
          type="file"
          accept=".svg,image/svg+xml"
          className={styles.hidden}
          onChange={(e) => {
            void upload(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      <Hint>
        Icons are drawn as vector outlines, so the SVG must contain shapes rather than text or
        images. Convert strokes and lettering to paths first.
      </Hint>

      {Object.keys(uploadedIcons).length > 0 && (
        <ul className={styles.uploads}>
          {Object.keys(uploadedIcons).map((id) => (
            <li key={id}>
              <IconPreview id={id} uploaded={uploadedIcons} />
              <span className={styles.value}>{id}</span>
              <button type="button" onClick={() => removeUploadedIcon(id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className={styles.error}>{error}</p>}
    </Panel>
  );
}

function IconPreview({ id, uploaded }: { id: string | null; uploaded: Record<string, string> }) {
  if (!id) return <span className={styles.swatch} />;
  const stored = uploaded[id];
  const art = stored
    ? parseStoredIcon(stored)
    : (() => {
        const bundled = BUNDLED_ICONS.find((i) => i.id === id);
        return bundled
          ? { d: bundled.d, cut: bundled.cut, view: { x: 0, y: 0, w: ICON_VIEWBOX, h: ICON_VIEWBOX } }
          : null;
      })();
  if (!art) return <span className={styles.swatch} />;

  return (
    <svg
      className={styles.swatch}
      viewBox={`${art.view.x} ${art.view.y} ${art.view.w} ${art.view.h}`}
      aria-hidden="true"
    >
      <path d={art.d} fill="var(--grey-8)" />
      {"cut" in art && art.cut && <path d={art.cut} fill="var(--surface)" />}
    </svg>
  );
}
