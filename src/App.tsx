import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import styles from "./App.module.css";
import { BUNDLED_FONTS } from "./assets/fonts";
import { validateGeometry } from "./core/geometry/validate";
import { analyseArtefacts, paginate, sheetCountFor } from "./core/imposition/paginate";
import { buildArtefacts } from "./core/data/artefacts";
import { hasBackSide, templateForSide } from "./core/imposition/duplex";
import { templateForRow } from "./core/template/overrides";
import { PAPER_WHITE, contrastIssues } from "./core/print/contrast";
import { missingAssets } from "./core/template/assets";
import { unboundTokens } from "./core/template/rebind";
import { makeResolveOptions } from "./core/template/resolve";
import { CardCanvas } from "./render/svg/CardCanvas";
import { SheetPreview } from "./render/svg/SheetPreview";
import { loadFonts as loadStoredFonts } from "./state/blobStore";
import { loadImages, toSource } from "./state/imageStore";
import { loadPrinters } from "./state/printerStore";
import { loadBundledFonts, registerFont } from "./state/fontLoader";
import {
  clear as clearSaved,
  clearPreMigration,
  read as readSaved,
  readPreMigration,
  save,
  type SaveInput,
} from "./state/persist";
import { downloadJson } from "./state/saveProjectFile";
import { usePlaque } from "./state/store";
import { useKeyboard } from "./state/useKeyboard";
import { Announcer } from "./ui/Announcer";
import { ClearDataButton } from "./ui/ClearDataButton";
import { DesktopGate, useIsDesktop } from "./ui/DesktopGate";
import { ExportBar } from "./ui/ExportBar";
import { MissingAssets } from "./ui/MissingAssets";
import { Pagination } from "./ui/Pagination";
import { PersistenceBar } from "./ui/PersistenceBar";
import { ProjectButtons } from "./ui/ProjectButtons";
import { RowsDrawer } from "./ui/RowsDrawer";
import { Sidebar } from "./ui/Sidebar";
import { WarningsList } from "./ui/WarningsList";

const PLACEHOLDER_ROW = { "": "" };

/** Absent scope means per-row: what every design written before scope existed meant. */
const PER_ROW = { kind: "per-row" } as const;

interface Notice {
  text: string;
  actions?: { label: string; onClick: () => void }[];
}

/** Read from the store rather than a closure, so the unload flush is never stale. */
function autosavePayload(): SaveInput {
  const s = usePlaque.getState();
  return {
    card: s.card,
    sheet: s.sheet,
    template: s.template,
    headers: s.headers,
    rows: s.rows,
    rowIds: s.rowIds,
    merged: s.merged,
    csvIssues: s.csvIssues,
    fileName: s.fileName,
    uploadedIcons: s.uploadedIcons,
    assetNames: s.assetNames,
    snapEnabled: s.snapEnabled,
    past: s.past,
    future: s.future,
  };
}

/** "13:42" — the restore notice says when, not how long ago. */
function clockTime(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime())
    ? "earlier"
    : at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Throws away what was restored without touching uploaded fonts or images. */
function discardRestore(): void {
  usePlaque.getState().clearAll();
  void clearSaved();
}

export function App() {
  const isDesktop = useIsDesktop();
  const [ready, setReady] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  useKeyboard();

  // App genuinely needs most of the design to draw the card, but it selects
  // explicitly so it re-renders on state it actually uses and no more. The
  // sidebar is memoised separately and does not re-render with App.
  const {
    card,
    sheet,
    template,
    rows,
    rowIds,
    headers,
    fonts,
    images,
    uploadedIcons,
    assetNames,
    csvIssues,
    fileName,
    page,
    selectedId,
    snapEnabled,
    previewGuestIndex,
    editingSide,
    printers,
    activePrinterId,
    past,
    future,
  } = usePlaque(
    useShallow((s) => ({
      card: s.card,
      sheet: s.sheet,
      template: s.template,
      rows: s.rows,
      rowIds: s.rowIds,
      headers: s.headers,
      fonts: s.fonts,
      images: s.images,
      uploadedIcons: s.uploadedIcons,
      assetNames: s.assetNames,
      csvIssues: s.csvIssues,
      fileName: s.fileName,
      page: s.page,
      selectedId: s.selectedId,
      snapEnabled: s.snapEnabled,
      previewGuestIndex: s.previewGuestIndex,
      editingSide: s.editingSide,
      printers: s.printers,
      activePrinterId: s.activePrinterId,
      past: s.past,
      future: s.future,
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
      const { printers, activeId } = await loadPrinters();
      if (cancelled) return;

      usePlaque.getState().setPrinters(printers, activeId);

      usePlaque.getState().setImages(
        new Map(storedImages.map((i) => [i.id, toSource(i)])),
        Object.fromEntries(storedImages.map((i) => [i.id, i.name])),
      );

      const saved = await readSaved();
      const queued: Notice[] = [];
      if (saved.status === "ok") {
        // version and savedAt describe the record, not the design; they have no
        // business in the store.
        const { version: _version, savedAt, ...restored } = saved.data;
        usePlaque.getState().hydrate({ ...restored, uploadedFontIds: stored.map((f) => f.id) });
        queued.push({
          text: savedAt
            ? `Restored your work from ${clockTime(savedAt)}.`
            : "Restored your last design.",
          actions: [{ label: "Discard restore", onClick: discardRestore }],
        });
      } else if (saved.status === "discarded") {
        queued.push({ text: `${saved.reason} Starting fresh.` });
      } else {
        queued.push({ text: "Everything you do here stays on this device. Nothing is uploaded." });
      }

      // A project file that had to be migrated left its original here. Offer it
      // back rather than storing something nobody can reach (S-D1.3).
      const original = await readPreMigration();
      if (original) {
        queued.push({
          text: `The original of "${original.fileName}" (project format v${original.fromVersion}) is still kept on this device.`,
          actions: [
            {
              label: "Download original",
              onClick: () => downloadJson(original.fileName, original.text),
            },
            { label: "Discard original", onClick: () => void clearPreMigration() },
          ],
        });
      }
      setNotices(queued);

      usePlaque.getState().setFonts(bundled, labels);
      setReady(true);
    })().catch(() => setReady(true));
    return () => {
      cancelled = true;
    };
  }, []);

  // A failed write is reported, never swallowed: an edit the user believes is
  // saved and is not is the whole of prime directive 1 (S-D1.2).
  const attemptSave = () => {
    void save(autosavePayload()).then((result) => setSaveError(result.ok ? null : result.reason));
  };

  // Autosave. Font binaries are excluded — they live in IndexedDB under their
  // own keys — but undo history is not: a reload that silently resets how far
  // back the user can step is lost work too.
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(attemptSave, 400);
    return () => clearTimeout(timer);
  }, [
    ready,
    card,
    sheet,
    template,
    headers,
    rows,
    uploadedIcons,
    snapEnabled,
    csvIssues,
    fileName,
    past,
    future,
  ]);

  // The debounce above means a tab killed within 400ms of the last edit would
  // lose it, so a tab going away flushes immediately.
  // ponytail: best effort. An IndexedDB write started during pagehide is
  // usually completed by the browser but is not guaranteed. Upgrade path if it
  // ever proves lossy: keep a synchronous localStorage copy of the design only
  // (rows excluded, they will not fit) as a last-resort crash log.
  useEffect(() => {
    if (!ready) return;
    const flush = () => void save(autosavePayload());
    const flushIfHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flushIfHidden);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flushIfHidden);
    };
  }, [ready]);

  const resolveOptions = useMemo(
    () => makeResolveOptions(fonts, uploadedIcons, images, assetNames),
    [fonts, uploadedIcons, images, assetNames],
  );

  // Rows become artefacts once, here. Everything downstream counts artefacts:
  // 150 guests is 150 place cards, or 19 table menus, or one run-sheet.
  const artefacts = useMemo(
    () => buildArtefacts(rows, template.rowScope ?? PER_ROW, headers, rowIds),
    [rows, template.rowScope, headers, rowIds],
  );

  const previewArtefact = artefacts[previewGuestIndex] ?? artefacts[0] ?? null;
  const previewRow = previewArtefact?.row ?? PLACEHOLDER_ROW;

  // The card editor shows one side at a time. Sheet preview stays front-only:
  // the back sheet is a print artefact, and its mirroring is proven by the
  // duplex test sheet rather than by a preview nobody can hold up to a window.
  const editableTemplate = useMemo(() => {
    // The editor shows the card as it will actually print: one side, with this
    // row's own overrides applied. Editing against anything else would mean the
    // preview and the sheet disagree, which is the one thing Plaque must not do.
    const sided = hasBackSide(template) ? templateForSide(template, editingSide) : template;
    return previewArtefact ? templateForRow(sided, previewArtefact.rowId) : sided;
  }, [template, editingSide, previewArtefact]);

  // Row-independent, so this gates export without resolving a single card.
  const missing = useMemo(
    () => missingAssets(template, (id) => images.has(id), (id) => fonts.has(id)),
    [template, images, fonts],
  );

  // How many sheets the job needs, without building any of them.
  const sheetCount = useMemo(
    () => sheetCountFor(artefacts.length, card, sheet),
    [artefacts.length, card, sheet],
  );
  const pageIndex = Math.min(page, Math.max(0, sheetCount - 1));

  // Only the sheet on screen is imposed. Building all nineteen on every drag
  // frame is what put the editor under 60fps.
  const currentSheet = useMemo(() => {
    const range = { from: pageIndex, to: pageIndex };
    const front = templateForSide(template, "front");
    return paginate(front, artefacts, card, sheet, resolveOptions, { pages: range }).sheets[0];
  }, [template, artefacts, card, sheet, resolveOptions, pageIndex]);

  // The "these names do not fit" pass has to look at every guest, so it runs at
  // a lower priority: it may lag a drag by a frame, but it never blocks one.
  const deferredTemplate = useDeferredValue(template);
  const deferredCard = useDeferredValue(card);
  const deferredArtefacts = useDeferredValue(artefacts);
  const analysis = useMemo(
    () => analyseArtefacts(deferredTemplate, deferredArtefacts, deferredCard, resolveOptions),
    [deferredTemplate, deferredArtefacts, deferredCard, resolveOptions],
  );
  const warnings = analysis.warnings;

  const printer = printers.find((p) => p.id === activePrinterId) ?? null;
  const geometryIssues = useMemo(
    () =>
      validateGeometry(card, sheet, {
        ...(printer?.name ? { printerName: printer.name } : {}),
        ...(printer?.unprintableMarginMm === undefined
          ? {}
          : { unprintableMarginMm: printer.unprintableMarginMm }),
      }),
    [card, sheet, printer],
  );

  // Two more checks that belong beside the geometry ones: ink the stock will
  // swallow (E4), and tokens naming a column this CSV does not have (E5).
  const issues = useMemo(() => {
    const stock = template.backgroundHex ?? PAPER_WHITE;
    const contrast = contrastIssues(template.elements, stock).map((issue) => ({
      id: `contrast-${issue.elementId}`,
      severity: (issue.verdict === "poor" ? "error" : "warning") as "error" | "warning",
      message: `${issue.inkHex} on ${stock} is ${issue.ratio} — ${
        issue.verdict === "poor"
          ? "too close to the stock to read across a table."
          : "marginal on this stock in poor light."
      }`,
    }));
    const unbound = unboundTokens(template, headers).map((token) => ({
      id: `unbound-${token}`,
      severity: "error" as const,
      message: `Nothing in this CSV is called "${token}", so it will print as a gap. Rename the column or edit the element.`,
    }));
    return [...geometryIssues, ...contrast, ...unbound];
  }, [geometryIssues, template, headers]);

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

      <Announcer />
      <Sidebar />

      <main className={styles.main}>
        {saveError && <PersistenceBar reason={saveError} onRetry={attemptSave} />}

        {notices.map((notice) => {
          const dismiss = () => setNotices((all) => all.filter((n) => n !== notice));
          return (
            <p className={styles.notice} key={notice.text}>
              {notice.text}
              {notice.actions?.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  className={styles.noticeAction}
                  onClick={() => {
                    action.onClick();
                    dismiss();
                  }}
                >
                  {action.label}
                </button>
              ))}
              <button type="button" onClick={dismiss} aria-label="Dismiss">
                ✕
              </button>
            </p>
          );
        })}

        <div className={styles.workspace}>
          <section className={styles.pane} aria-label="Card">
            <h2 className={styles.paneTitle}>
              Card{hasBackSide(template) ? ` — ${editingSide}` : ""}
              {artefacts.length > 0 && (
                <span className={styles.paneMeta}>
                  {/* Scope decides what "one of these" means: a guest, a table, the lot. */}
                  {previewArtefact?.label} — {previewGuestIndex + 1} of {artefacts.length}
                </span>
              )}
            </h2>
            <div className={styles.paneBody}>
              <CardCanvas
                card={card}
                template={editableTemplate}
                row={previewRow}
                rows={previewArtefact?.rows ?? [previewRow]}
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
              count={artefacts.length}
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

        <RowsDrawer
          artefacts={artefacts}
          headroom={analysis.headroom}
          selectedIndex={previewGuestIndex}
          onSelect={setPreviewGuestIndex}
        />
        <MissingAssets missing={missing} />
        <WarningsList issues={issues} warnings={warnings} artefacts={artefacts} />
        <ExportBar
          sheetCount={sheetCount}
          issues={issues}
          artefacts={artefacts}
          warnings={warnings}
          missing={missing}
        />
      </main>
    </div>
  );
}
