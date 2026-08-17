import { useEffect, useMemo, useState } from "react";
import styles from "./App.module.css";
import { parseCsv } from "./core/csv/parse";
import { paginate } from "./core/imposition/paginate";
import { defaultCard, defaultSheet, defaultTemplate } from "./core/template/defaults";
import { makeResolveOptions } from "./core/template/resolve";
import type { LoadedFont } from "./core/text/measure";
import { SheetPreview } from "./render/svg/SheetPreview";
import { loadBundledFonts } from "./state/fontLoader";
import { Pagination } from "./ui/Pagination";

// Phase 5 harness: proves the SVG renderer against the same core the PDF uses.
// Phase 7 replaces this with the store and a real CSV upload.
const DEMO_CSV = `First Name,Last Name,Table,Dietary,Entree
Charis,Smith,Table 1,Vegetarian,Risotto
Alexander,Wright,Table 1,None,Beef
Eleanor,Vane,Table 2,Gluten-Free,Chicken
Tobias,Ashdown,Table 2,Vegan,Aubergine
Priya,Raghunathan,Table 3,Nut-Free,Beef
Bartholomew,Featherstonehaugh,Table 3,Halal,Lamb
Chloé,Beaumont,Table 4,Kosher,Salmon
Ólafur,Sørensen,Table 4,Dairy-Free,Chicken
Niamh,O'Dwyer,Table 5,Child,Chicken
`;

export function App() {
  const [fonts, setFonts] = useState<Map<string, LoadedFont> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    loadBundledFonts().then(setFonts, (e: unknown) =>
      setError(e instanceof Error ? e.message : String(e)),
    );
  }, []);

  const sheets = useMemo(() => {
    if (!fonts) return [];
    const card = defaultCard();
    const { headers, rows } = parseCsv(DEMO_CSV);
    return paginate(
      defaultTemplate(headers, card),
      rows,
      card,
      defaultSheet(),
      makeResolveOptions(fonts),
    ).sheets;
  }, [fonts]);

  if (error) return <p className={styles.status}>Could not load fonts: {error}</p>;
  if (!fonts) return <p className={styles.status}>Loading fonts…</p>;

  const sheet = sheets[Math.min(page, sheets.length - 1)];

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1 className={styles.title}>Plaque</h1>
      </header>
      <main className={styles.canvas}>
        {sheet && <SheetPreview sheet={sheet} fonts={fonts} className={styles.sheet} />}
      </main>
      <footer className={styles.footer}>
        <Pagination index={page} count={sheets.length} onChange={setPage} />
      </footer>
    </div>
  );
}
