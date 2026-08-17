import { useEffect, useMemo, useState } from "react";
import styles from "./App.module.css";
import { BUNDLED_FONTS } from "./assets/fonts";
import { validateGeometry } from "./core/geometry/validate";
import { paginate } from "./core/imposition/paginate";
import { makeResolveOptions } from "./core/template/resolve";
import { CardCanvas } from "./render/svg/CardCanvas";
import { SheetPreview } from "./render/svg/SheetPreview";
import { loadFonts as loadStoredFonts } from "./state/blobStore";
import { loadBundledFonts, registerFont } from "./state/fontLoader";
import { load as loadSaved, save } from "./state/persist";
import { usePlaque } from "./state/store";
import { useKeyboard } from "./state/useKeyboard";
import { ClearDataButton } from "./ui/ClearDataButton";
import { DesktopGate, useIsDesktop } from "./ui/DesktopGate";
import { ExportBar } from "./ui/ExportBar";
import { Pagination } from "./ui/Pagination";
import { Sidebar } from "./ui/Sidebar";
import { WarningsList } from "./ui/WarningsList";

const PLACEHOLDER_ROW = { "": "" };

export function App() {
  const isDesktop = useIsDesktop();
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useKeyboard();

  const state = usePlaque();
  const {
    card,
    sheet,
    template,
    rows,
    headers,
    fonts,
    uploadedIcons,
    page,
    selectedId,
    snapEnabled,
    previewGuestIndex,
  } = state;

  // Load fonts and any saved design once, before the first render of the canvas.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const bundled = await loadBundledFonts();
      const labels: Record<string, string> = {};
      for (const f of BUNDLED_FONTS) labels[f.id] = f.label;

      const stored = await loadStoredFonts();
      for (const f of stored) {
        try {
          bundled.set(f.id, await registerFont(f.id, f.family, f.data));
          labels[f.id] = f.family;
        } catch {
          // A font that no longer parses should not stop the app from opening.
        }
      }
      if (cancelled) return;

      const saved = loadSaved();
      if (saved.status === "ok") {
        usePlaque.getState().hydrate({ ...saved.data, uploadedFontIds: stored.map((f) => f.id) });
      } else if (saved.status === "discarded") {
        setNotice(`${saved.reason} Starting fresh.`);
      } else {
        setNotice("Everything you do here stays on this device. Nothing is uploaded.");
      }

      usePlaque.getState().setFonts(bundled, labels);
      setReady(true);
    })().catch(() => setReady(true));
    return () => {
      cancelled = true;
    };
  }, []);

  // Autosave. Fonts and undo history are deliberately excluded.
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      save({
        card,
        sheet,
        template,
        headers,
        rows,
        csvIssues: state.csvIssues,
        fileName: state.fileName,
        uploadedIcons,
        snapEnabled,
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [ready, card, sheet, template, headers, rows, uploadedIcons, snapEnabled, state.csvIssues, state.fileName]);

  const resolveOptions = useMemo(
    () => makeResolveOptions(fonts, uploadedIcons),
    [fonts, uploadedIcons],
  );

  const { sheets, warnings } = useMemo(
    () => paginate(template, rows, card, sheet, resolveOptions),
    [template, rows, card, sheet, resolveOptions],
  );

  const issues = useMemo(() => validateGeometry(card, sheet), [card, sheet]);
  const previewRow = rows[previewGuestIndex] ?? rows[0] ?? PLACEHOLDER_ROW;
  const currentSheet = sheets[Math.min(page, Math.max(0, sheets.length - 1))];

  if (!isDesktop) return <DesktopGate />;
  if (!ready) return <p className={styles.status}>Loading fonts…</p>;

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1 className={styles.title}>Plaque</h1>
        <span className={styles.tagline}>Place cards, printed at home</span>
        <ClearDataButton />
      </header>

      <Sidebar />

      <main className={styles.main}>
        {notice && (
          <p className={styles.notice}>
            {notice}
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
              ✕
            </button>
          </p>
        )}

        <div className={styles.workspace}>
          <section className={styles.pane} aria-label="Card">
            <h2 className={styles.paneTitle}>
              Card
              {rows.length > 0 && (
                <span className={styles.paneMeta}>
                  showing guest {previewGuestIndex + 1} of {rows.length}
                </span>
              )}
            </h2>
            <div className={styles.paneBody}>
              <CardCanvas
                card={card}
                template={template}
                row={previewRow}
                fonts={fonts}
                resolveOptions={resolveOptions}
                selectedId={selectedId}
                snapEnabled={snapEnabled}
                onSelect={state.select}
                onEditStart={state.beginEdit}
                onChange={state.setElementBox}
              />
            </div>
            <Pagination
              index={previewGuestIndex}
              count={rows.length}
              onChange={state.setPreviewGuestIndex}
            />
          </section>

          <section className={styles.pane} aria-label="Sheet">
            <h2 className={styles.paneTitle}>Sheet</h2>
            <div className={styles.paneBody}>
              {currentSheet ? (
                <SheetPreview sheet={currentSheet} fonts={fonts} className={styles.sheet} />
              ) : (
                <p className={styles.empty}>Nothing to impose yet.</p>
              )}
            </div>
            <Pagination index={page} count={sheets.length} onChange={state.setPage} />
          </section>
        </div>

        <WarningsList issues={issues} warnings={warnings} rows={rows} headers={headers} />
        <ExportBar sheetCount={sheets.length} />
      </main>
    </div>
  );
}
