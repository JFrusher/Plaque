import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import styles from "./App.module.css";
import { BUNDLED_FONTS } from "./assets/fonts";
import { validateGeometry } from "./core/geometry/validate";
import { collectWarnings, paginate, sheetCountFor } from "./core/imposition/paginate";
import { makeResolveOptions } from "./core/template/resolve";
import { CardCanvas } from "./render/svg/CardCanvas";
import { SheetPreview } from "./render/svg/SheetPreview";
import { loadFonts as loadStoredFonts } from "./state/blobStore";
import { loadImages, toSource } from "./state/imageStore";
import { loadBundledFonts, registerFont } from "./state/fontLoader";
import { load as loadSaved, save } from "./state/persist";
import { usePlaque } from "./state/store";
import { useKeyboard } from "./state/useKeyboard";
import { ClearDataButton } from "./ui/ClearDataButton";
import { DesktopGate, useIsDesktop } from "./ui/DesktopGate";
import { ExportBar } from "./ui/ExportBar";
import { Pagination } from "./ui/Pagination";
import { ProjectButtons } from "./ui/ProjectButtons";
import { Sidebar } from "./ui/Sidebar";
import { WarningsList } from "./ui/WarningsList";

const PLACEHOLDER_ROW = { "": "" };

export function App() {
  const isDesktop = useIsDesktop();
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useKeyboard();

  // App genuinely needs most of the design to draw the card, but it selects
  // explicitly so it re-renders on state it actually uses and no more. The
  // sidebar is memoised separately and does not re-render with App.
  const {
    card,
    sheet,
    template,
    rows,
    headers,
    fonts,
    images,
    uploadedIcons,
    csvIssues,
    fileName,
    page,
    selectedId,
    snapEnabled,
    previewGuestIndex,
  } = usePlaque(
    useShallow((s) => ({
      card: s.card,
      sheet: s.sheet,
      template: s.template,
      rows: s.rows,
      headers: s.headers,
      fonts: s.fonts,
      images: s.images,
      uploadedIcons: s.uploadedIcons,
      csvIssues: s.csvIssues,
      fileName: s.fileName,
      page: s.page,
      selectedId: s.selectedId,
      snapEnabled: s.snapEnabled,
      previewGuestIndex: s.previewGuestIndex,
    })),
  );

  // Actions never change identity in zustand, so they are read once.
  const { select, beginEdit, setElementBox, setPage, setPreviewGuestIndex } = usePlaque.getState();

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
      const storedImages = await loadImages();
      if (cancelled) return;

      usePlaque.getState().setImages(
        new Map(storedImages.map((i) => [i.id, toSource(i)])),
        Object.fromEntries(storedImages.map((i) => [i.id, i.name])),
      );

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
        csvIssues,
        fileName,
        uploadedIcons,
        snapEnabled,
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [ready, card, sheet, template, headers, rows, uploadedIcons, snapEnabled, csvIssues, fileName]);

  const resolveOptions = useMemo(
    () => makeResolveOptions(fonts, uploadedIcons, images),
    [fonts, uploadedIcons, images],
  );

  // How many sheets the list needs, without building any of them.
  const sheetCount = useMemo(() => sheetCountFor(rows.length, card, sheet), [rows.length, card, sheet]);
  const pageIndex = Math.min(page, Math.max(0, sheetCount - 1));

  // Only the sheet on screen is imposed. Building all nineteen on every drag
  // frame is what put the editor under 60fps.
  const currentSheet = useMemo(() => {
    const range = { from: pageIndex, to: pageIndex };
    return paginate(template, rows, card, sheet, resolveOptions, { pages: range }).sheets[0];
  }, [template, rows, card, sheet, resolveOptions, pageIndex]);

  // The "these names do not fit" pass has to look at every guest, so it runs at
  // a lower priority: it may lag a drag by a frame, but it never blocks one.
  const deferredTemplate = useDeferredValue(template);
  const deferredCard = useDeferredValue(card);
  const warnings = useMemo(
    () => collectWarnings(deferredTemplate, rows, deferredCard, resolveOptions),
    [deferredTemplate, rows, deferredCard, resolveOptions],
  );

  const issues = useMemo(() => validateGeometry(card, sheet), [card, sheet]);
  const previewRow = rows[previewGuestIndex] ?? rows[0] ?? PLACEHOLDER_ROW;

  if (!isDesktop) return <DesktopGate />;
  if (!ready) return <p className={styles.status}>Loading fonts…</p>;

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1 className={styles.title}>Plaque</h1>
        <span className={styles.tagline}>Place cards, printed at home</span>
        <ProjectButtons />
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
                onSelect={select}
                onEditStart={beginEdit}
                onChange={setElementBox}
              />
            </div>
            <Pagination
              index={previewGuestIndex}
              count={rows.length}
              onChange={setPreviewGuestIndex}
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
            <Pagination index={pageIndex} count={sheetCount} onChange={setPage} />
          </section>
        </div>

        <WarningsList issues={issues} warnings={warnings} rows={rows} headers={headers} />
        <ExportBar sheetCount={sheetCount} />
      </main>
    </div>
  );
}
