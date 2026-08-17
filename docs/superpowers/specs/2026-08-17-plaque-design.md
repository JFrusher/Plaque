<context>
# Plaque — Automated Place Card Pipeline

## What this is
An open-source, zero-backend web app that turns a guest CSV into vector-accurate,
print-ready PDF sheets of place cards. The user designs ONE card template in a
freeform drag editor, binds text elements to CSV columns, and Plaque stamps that
template once per guest across an imposed A4/Letter grid with crop marks, cut
lines and fold guides.

Commercial stationery platforms charge per-card export fees for this. Plaque does
the whole job in browser memory and never transmits guest data anywhere.

## Users
- **DIY couples** printing at home or handing a PDF to a local print shop.
- **Caterers / venue staff** who read dietary icons off the card at speed during
  service.

## Decisions already made (do not re-litigate)
| Decision | Choice |
|---|---|
| v1 scope | Place cards only. The PRD's "Timeline Recalculation < 16ms / 200 event nodes" NFR is stray text from another product — **deleted**. |
| Stack | Vite + React + TypeScript, static build, no server. |
| PDF engine | `pdf-lib` + `@pdf-lib/fontkit`. |
| Card content | Freeform drag editor. |
| Edit model | ONE template, stamped N times. No per-guest overrides. |
| Geometry | Fully custom card size, fold axis, fold position, bleed and margins. App computes and ranks layout suggestions that maximise cards per sheet. |
| Preview | SVG in mm units for screen; real PDF only on export. |
| Persistence | Everything persists locally; prominent Clear-all-data control. |
| Icons | ~8 bundled SVG icons + user SVG upload. |
| Fonts | 5–6 bundled faces + user `.ttf`/`.otf` upload. **`.woff2` dropped from FR-STA-07.** |
| Overflow | User-configurable per text element: wrap, shrink, min size, shrink anchor. |
| Testing | Vitest on pure logic + one PDF smoke test. No Playwright. |
| CSV | Arbitrary columns; every header becomes a bindable `{{Field}}`. |
| Mobile | Desktop only. Hard gate below 1024px. |
| Delivery | Static build to GitHub Pages via Actions. MIT. |
| UI look | Quiet studio tool — neutral greys, one accent, canvas is the hero. |

## Non-negotiables
1. **Zero backend.** No fetch to any origin other than the app's own static
   assets. No analytics, no telemetry, no CDN fonts. Guest data never leaves the
   device.
2. **Vector output.** No rasterisation of text or icons into the PDF. Text is
   embedded font glyphs; icons are PDF path operators.
3. **Preview and PDF must agree on layout decisions.** Chosen font size and line
   breaks are computed once, from font metrics, and consumed by both renderers.
</context>

<architecture>
## The one big idea

A single **scene graph in millimetres** is the source of truth. Two renderers
consume it and neither owns any layout logic:

```
CSV rows ─┐
          ├─> resolve bindings ─> Card scenes ─> paginate ─> Sheet scenes ─┬─> SVG renderer (screen)
Template ─┘                                                               └─> PDF renderer (export)
```

Everything between "CSV rows" and "Sheet scenes" is pure TypeScript in `src/core/`
with no React, no DOM, no `window`. That is where every unit test lives.

## Coordinate system rules (violating these is a bug)

- **Unit is millimetres, everywhere, in every stored value.** No pixels, no
  points, no inches in state or in `core/`. Conversion happens only at render.
- **Scene graph is top-left origin, y increases downward.** Same as SVG, same as
  how a human describes a page.
- **`src/render/pdf/renderPdf.ts` is the ONLY file permitted to flip the y-axis.**
  PDF's origin is bottom-left, y-up. That conversion lives in exactly one
  function, `toPdfPoint()`, and nothing else in the codebase knows about it.
- Element positions are **card-absolute**, not panel-relative. Which fold panel an
  element belongs to is *derived* from where its centre falls, never stored.

## Fold and inversion model (FR-STA-04)

A card is a flat rectangle `widthMm × heightMm` that gets cut out and folded.

- `fold: 'horizontal'` splits at `foldPositionMm` from the top. Top panel
  `[0, fold)`, bottom panel `[fold, height)`.
- When folded and stood up, the **bottom panel is the front face** (reads normally,
  faces the guest) and the **top panel is the back face**, which must be rotated
  180° so it reads correctly from across the table.
- `fold: 'vertical'` splits at `foldPositionMm` from the left. Left panel is front,
  right panel is back, back mirrored about the fold axis.
- `fold: 'none'` — one panel, no inversion, `invertBackPanel` ignored.

**The 180° transform.** For back-panel centre `c`, any point `p` maps to
`p' = 2c − p`. To draw rotated text in pdf-lib: compute the text's unrotated
baseline-start point in card coordinates, map it through `p' = 2c − p`, and draw at
that point with `rotate: degrees(180)`. Because rotating the whole text box 180°
about `c` sends the baseline-start corner exactly where the rotated glyph run
begins, the result is correct without any bounding-box fudging. This has a
dedicated unit test.

## Text fitting (FR-STA-03)

Fitting is the one place where preview/PDF drift would be visible, so it is decided
once, in `core/text/fit.ts`, from **fontkit advance widths** — never from
`canvas.measureText` and never from the browser's SVG layout.

Per-element `FitConfig`:
```ts
type FitConfig = {
  mode: 'none' | 'shrink' | 'wrap' | 'shrink-then-wrap';
  minFontSizePt: number;   // floor; default 8
  anchor: 'left' | 'center' | 'right';  // the point scaling shrinks around
  maxLines: number;        // default 1
};
```
- `shrink` — reduce size in 0.5pt steps until the run fits `w`, floored at
  `minFontSizePt`.
- `wrap` — break on spaces to at most `maxLines`, no size change.
- `shrink-then-wrap` — wrap first, then shrink the wrapped block to fit `h`.
- If the floor is hit and it still overflows, the element renders **at the floor
  size** and `fit()` returns `{ overflowed: true }`. It never silently produces an
  unreadable 5pt name. The sidebar surfaces the affected guest names.

`fit()` returns `{ fontSizePt, lines[], overflowed }`. Both renderers consume that
result verbatim. The SVG renderer may differ from the PDF by a fraction of a
millimetre in glyph advance (browser shaping vs fontkit), but **the chosen size
and the line breaks are always identical** — that is the invariant.

## Icons (FR-STA-05)

Every icon — bundled or uploaded — is normalised to a **single SVG path `d` string
in a 24×24 viewBox**. That one representation renders in both worlds: `<path d>`
in SVG, `page.drawSvgPath(d, ...)` in pdf-lib.

Uploaded SVGs are parsed; `<path>` elements are taken directly, and
`rect`/`circle`/`ellipse`/`line`/`polygon`/`polyline` are converted to path data.
Anything else (embedded raster, `<text>`, `<use>`, filters) is **rejected with an
explicit message** — it cannot be represented as vector path operators and
silently dropping it would produce a wrong card.

Mapping is rule-based on any CSV column: `{ match: string, iconId: string }[]`,
case-insensitive exact match on the trimmed cell value, plus an optional fallback.

## Bleed, margins and safety

- `bleedMm` extends background/shape fills beyond the cut line. Crop marks are
  offset outside the bleed, not outside the card.
- `printerMarginMm` (default 5) models the non-printable border of a typical home
  printer. Layout suggestions respect it; if the user sets page margins smaller,
  the sidebar warns but does not block.
- If bleeds are enabled and `gapX/gapY < 2 × bleedMm`, adjacent bleeds overlap.
  The validator warns.

## State

`zustand` store, split into slices: `guests`, `template`, `card`, `sheet`, `fonts`,
`icons`, `ui`. Chosen over `useReducer` + context for one concrete reason: dragging
an element at 60fps through context re-renders the entire sidebar; zustand
selectors keep the drag confined to the canvas.

Undo/redo wraps the `template` + `card` + `sheet` slices only (not guest data, not
UI state), capped at 50 entries, bound to `Ctrl/Cmd+Z` and `Ctrl/Cmd+Shift+Z`.

## Storage

- `localStorage` key `plaque.v1` — `{ version, guests, template, card, sheet, ui }`
  as JSON. Versioned; an unknown version is discarded with a notice rather than
  crash-looping.
- **Uploaded font and icon binaries go to IndexedDB** (`idb-keyval`), not
  localStorage. A single .otf can exceed the ~5MB localStorage quota on its own.
- "Clear all data" wipes both stores and reloads. First run shows a one-time
  notice that data stays on this device.
</architecture>

<tech_stack>
## Runtime dependencies
| Package | Why |
|---|---|
| `react`, `react-dom` | UI. |
| `pdf-lib` | Vector PDF assembly; `drawText`, `drawLine` with `dashArray`, `drawSvgPath`. |
| `@pdf-lib/fontkit` | Custom font embedding + subsetting for pdf-lib. |
| `fontkit` | Advance-width metrics for `core/text/measure.ts`, independent of any PDF document. |
| `papaparse` | CSV parsing with quoted fields, BOM, CRLF, ragged rows. Do not hand-roll. |
| `zustand` | Store with selectors; see rationale above. |
| `idb-keyval` | ~600 byte IndexedDB wrapper for font/icon blobs. |

## Dev dependencies
`vite`, `typescript`, `@vitejs/plugin-react`, `vitest`, `@types/papaparse`.

## Deliberately NOT used
- **No CSS framework.** One `src/index.css` of design tokens (CSS custom
  properties) plus CSS Modules per component. A single-screen tool does not earn a
  build-time style pipeline.
- **No UI component library.** Native `<input type="number">`, `<select>`,
  `<input type="color">`, `<dialog>` for modals. Platform features before deps.
- **No `svg2pdf.js` / SVG→PDF conversion.** The two-renderer architecture exists
  specifically to avoid it.
- **No router.** One screen. The PRD's `/place-cards` path is served at `/`.
- **No Playwright, no visual regression.** Per the testing decision.
- **No state persistence library.** `persist.ts` is ~40 lines.

## Browser targets
Chrome, Edge, Firefox, Safari — current and current−1. Requires `FontFace`,
IndexedDB, Pointer Events, `<dialog>`. No polyfills, no legacy build.
</tech_stack>

<key_requirements>
## Functional

**FR-STA-01 — CSV ingestion.** Drag-and-drop or file-picker CSV upload. Arbitrary
headers. Every header becomes a bindable `{{Header}}` token. Header-guessing
pre-fills name/table/dietary conventions but never restricts. Shows row count,
detected columns, and a per-row error list for ragged rows. Rejects non-CSV with a
clear message.

**FR-STA-02 — Geometry engine.** Arbitrary card `widthMm × heightMm`. Fold
`none | horizontal | vertical` at an arbitrary `foldPositionMm`. Page A4 or Letter,
portrait or landscape. Independent top/right/bottom/left margins, independent
`gapX`/`gapY`, `bleedMm`, `printerMarginMm`, and optional 90° card rotation on the
sheet. `suggestLayouts()` returns ranked candidates maximising cards per sheet.
Presets for common sizes are seeds for that function, not a hardcoded table.

**FR-STA-03 — Text fitting.** Per-element `FitConfig` as specified in
`<architecture>`. Overflow at the floor is reported, never hidden.

**FR-STA-04 — Fold inversion.** Back panel rotated 180° (horizontal fold) or
mirrored (vertical fold) when `invertBackPanel` is on. Correct in both SVG and PDF.

**FR-STA-05 — Icon mapping.** Bundled set of 8 (vegetarian, vegan, gluten-free,
dairy-free, nut-free, halal, kosher, child). User SVG upload with the path-only
constraint. Rules on any column.

**FR-STA-06 — Crop guides.** Independently toggleable: crop marks (0.25pt hairline,
5mm long, offset outside the bleed), cut lines (0.25pt full card outline), fold
guides (0.25pt dashed on the fold axis), bleed guides (screen-only, never in the
PDF).

**FR-STA-07 — Font upload.** 5–6 bundled self-hosted faces plus `.ttf`/`.otf`
upload. The same `ArrayBuffer` feeds `FontFace` for the SVG preview and
`embedFont` for the PDF — one binary, one source of truth. `.woff2` is out of
scope; the file picker states the accepted formats.

**Freeform editor.** Add/select/move/resize/delete/reorder/duplicate text, icon,
rect and line elements on the card. Marquee-free single selection is acceptable for
v1; multi-select is not required. Arrow-key nudge (1mm, 0.1mm with Shift). Snap to
card edges, card centre, fold axis, and other element edges, with a toggle.
Undo/redo. Numeric x/y/w/h inputs in the inspector — the drag is a convenience, the
numbers are the truth.

**Sheet preview.** Real-time SVG showing "Sheet _n_ of _N_" with prev/next
pagination, rendering actual guest data, crop marks, fold lines and bleed
boundaries.

## Non-functional

- **NFR-1 Zero backend.** Verified by a test that greps the built bundle for
  `http://` / `https://` origins other than XML namespace URIs.
- **NFR-2 PDF performance.** 150 guests must export in **< 3.0s** on a modern
  desktop. Each font embedded exactly once per document with subsetting on; the
  template scene is resolved per guest but never re-parsed.
- **NFR-3 Editor performance.** Dragging holds 60fps at 200 guests loaded — the
  editor canvas renders ONE card, never the full sheet.
- **NFR-4 Desktop gate.** Below 1024px viewport width, render a full-screen notice
  instead of the app. No half-working touch editor.
- **NFR-5 Accessibility.** All sidebar controls keyboard-reachable with visible
  focus rings and real `<label>` associations. The canvas is a mouse surface, but
  every canvas action has a numeric-input equivalent in the inspector.
- **NFR-6 Data safety.** Clear-all-data control is always visible in the header.
  First-run local-data notice. No data leaves the device.

## Acceptance criteria for "done"
1. `npm run test` green, including the PDF smoke test.
2. `npm run build` produces a `dist/` that runs from `file://` or any static host.
3. A 150-guest fixture CSV exports a PDF in under 3.0s with the correct page count.
4. Opening that PDF in a viewer shows selectable, searchable text (proving vector,
   not raster).
5. Printing one sheet at 100% scale yields cards that measure their specified size
   with a ruler, within printer tolerance.
</key_requirements>

<file_structure>
```
plaque/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── LICENSE                          # MIT
├── README.md
├── .github/workflows/ci.yml         # test + build + deploy Pages on main
├── PRD.md                           # existing; keep, mark superseded by this spec
├── docs/superpowers/specs/2026-08-17-plaque-design.md   # this file
│
├── fixtures/
│   ├── guests-5.csv
│   ├── guests-150.csv               # NFR-2 perf fixture
│   └── guests-messy.csv             # quotes, CRLF, BOM, ragged rows, unicode names
│
└── src/
    ├── main.tsx
    ├── App.tsx                      # desktop gate + layout shell only
    ├── index.css                    # design tokens; the ONLY global stylesheet
    │
    ├── core/                        # PURE TS. No React, no DOM, no window. 100% of unit tests.
    │   ├── types.ts                 # Mm, CardSpec, SheetSpec, Element union, FitConfig, Scene
    │   ├── units.ts                 # mmToPt, ptToMm, PAGE_SIZES_MM
    │   ├── units.test.ts
    │   ├── geometry/
    │   │   ├── pageLayout.ts        # cols/rows/origins from card+page+margins+gap
    │   │   ├── pageLayout.test.ts
    │   │   ├── suggestLayouts.ts    # ranked candidates maximising cards/sheet
    │   │   ├── suggestLayouts.test.ts
    │   │   ├── cropMarks.ts         # crop/cut/fold line segments for one card
    │   │   ├── cropMarks.test.ts
    │   │   ├── fold.ts              # panel derivation + 180°/mirror transforms
    │   │   ├── fold.test.ts
    │   │   ├── validate.ts          # bleed-overlap, printer-margin, zero-fit warnings
    │   │   └── validate.test.ts
    │   ├── text/
    │   │   ├── measure.ts           # fontkit advance widths, glyph runs
    │   │   ├── measure.test.ts
    │   │   ├── fit.ts               # the four FitConfig modes
    │   │   └── fit.test.ts
    │   ├── csv/
    │   │   ├── parse.ts             # papaparse wrapper -> { headers, rows, errors }
    │   │   ├── parse.test.ts
    │   │   ├── guessMapping.ts      # header heuristics
    │   │   ├── guessMapping.test.ts
    │   │   ├── interpolate.ts       # "{{First Name}}" -> value, missing -> ""
    │   │   └── interpolate.test.ts
    │   ├── template/
    │   │   ├── scene.ts             # element CRUD, z-order, duplicate, snap targets
    │   │   ├── scene.test.ts
    │   │   ├── bindings.ts          # template + guest row -> resolved CardScene
    │   │   ├── bindings.test.ts
    │   │   ├── icons.ts             # icon rule resolution
    │   │   └── icons.test.ts
    │   └── imposition/
    │       ├── paginate.ts          # guests -> Sheet[] of placed CardScenes
    │       └── paginate.test.ts
    │
    ├── render/
    │   ├── svg/
    │   │   ├── CardCanvas.tsx       # editor surface, ONE card
    │   │   ├── SheetPreview.tsx     # full imposed sheet, read-only
    │   │   ├── ElementView.tsx      # renders one element (text/icon/rect/line)
    │   │   ├── GuidesLayer.tsx      # crop marks, cut lines, fold, bleed
    │   │   ├── SelectionHandles.tsx
    │   │   └── useDragElement.ts    # pointer events -> mm deltas, snapping
    │   └── pdf/
    │       ├── renderPdf.ts         # doc assembly. THE ONLY y-flip (toPdfPoint).
    │       ├── renderPdf.test.ts    # the PDF smoke test
    │       ├── embedFonts.ts        # embed once, subset on, cache by fontId
    │       └── drawIcon.ts          # path d -> page.drawSvgPath
    │
    ├── state/
    │   ├── store.ts                 # zustand slices
    │   ├── history.ts               # undo/redo over template+card+sheet
    │   ├── persist.ts               # localStorage v1 schema + clearAll
    │   ├── persist.test.ts
    │   └── blobStore.ts             # idb-keyval for font/icon binaries
    │
    ├── ui/
    │   ├── Sidebar.tsx
    │   ├── panels/
    │   │   ├── DataPanel.tsx        # FR-STA-01: upload, mapping, row errors
    │   │   ├── GeometryPanel.tsx    # FR-STA-02: size, fold, bleed, margins, suggestions
    │   │   ├── ElementsPanel.tsx    # add element, layer list, z-order
    │   │   ├── InspectorPanel.tsx   # selected element: x/y/w/h, font, fit, colour
    │   │   ├── IconRulesPanel.tsx   # FR-STA-05
    │   │   ├── FontsPanel.tsx       # FR-STA-07
    │   │   └── GuidesPanel.tsx      # FR-STA-06 toggles
    │   ├── ExportBar.tsx            # download button, progress, overflow warnings
    │   ├── Pagination.tsx           # Sheet n of N
    │   ├── WarningsList.tsx         # overflow + geometry validator output
    │   ├── DesktopGate.tsx          # NFR-4
    │   └── ClearDataButton.tsx      # NFR-6
    │
    └── assets/
        ├── fonts/                   # 5-6 bundled, OFL/MIT-licensed, with LICENSES.md
        └── icons/index.ts           # 8 bundled icons as 24x24 path `d` strings
```

## Boundary rules
- `core/` never imports from `render/`, `state/`, `ui/`, or `react`.
- `render/` imports from `core/` only. It never mutates state.
- `ui/` owns all `state/` reads and writes; renderers receive props.
- `render/pdf/` is the only consumer of `pdf-lib`. `ui/` never imports it directly —
  it calls `renderPdf(sheets, opts)` and gets bytes back.
- No file over ~250 lines. If one grows past that, it is doing two jobs.
</file_structure>

<implementation_steps>
Ordered so that the product's hardest, highest-risk output — a correct PDF — is
provably working before a single pixel of UI is built. Each phase is independently
verifiable. Write the test first where a test is named.

---

### Phase 0 — Scaffold
**Do:** `npm create vite@latest` (react-ts). Add deps from `<tech_stack>`. Configure
`vitest`. Write `src/index.css` design tokens (neutral grey scale, one accent,
type scale, spacing scale). Add MIT `LICENSE`, `README.md`, `.github/workflows/ci.yml`
running test + build. Add the three fixture CSVs. `git init` — the repo is not
currently under version control.

**Accept:** `npm run dev`, `npm run test`, `npm run build` all succeed. CI green.

---

### Phase 1 — Geometry engine (pure, no UI)
**Do:** `core/types.ts`, `core/units.ts`, then `geometry/pageLayout.ts`,
`suggestLayouts.ts`, `cropMarks.ts`, `fold.ts`, `validate.ts`.

**Accept:**
- `mmToPt(25.4) === 72` exactly.
- A4 portrait, 85×55mm card, 10mm margins, 5mm gaps → 2 cols × 4 rows, and the
  card at index 5 has origin `(100, 130)` — col 1, row 2. Verify by hand before coding.
- `suggestLayouts()` for an 85×110mm card on A4 returns portrait-2×2 ranked above
  landscape-3×1, and every returned candidate's occupied area fits inside
  `page − margins` with no negative gap.
- `cropMarks()` with `bleedMm: 3` places marks 3mm further out than with
  `bleedMm: 0`.
- `fold.transformForPanel()` maps `(10, 10)` to `(75, 45)` for an 85×110 card,
  horizontal fold at 55, back panel = top → centre `(42.5, 27.5)`, `p' = 2c − p`.
- `validate()` warns when `gapX < 2 × bleedMm` and when any margin
  `< printerMarginMm`.

---

### Phase 2 — CSV + bindings (pure, no UI)
**Do:** `csv/parse.ts`, `guessMapping.ts`, `interpolate.ts`, `template/bindings.ts`,
`template/icons.ts`.

**Accept:**
- `guests-messy.csv` parses without throwing: BOM stripped, CRLF handled, quoted
  commas preserved, ragged rows surfaced in `errors` rather than dropped silently.
- Unicode names (`Chloé`, `Ólafur`, `李伟`) survive parse → interpolate unchanged.
- `interpolate("{{First Name}} {{Last Name}}", row)` resolves; an unknown token
  resolves to `""` and is reported, not left as literal `{{...}}` on a card.
- `icons.resolve("gluten-free", rules)` matches `"Gluten-Free"` and `" gluten-free "`
  (case-insensitive, trimmed).

---

### Phase 3 — Font metrics + fitting (pure, no UI)
**Do:** `text/measure.ts` (fontkit), `text/fit.ts`. Add bundled fonts to
`assets/fonts/` with a `LICENSES.md`.

**Accept:**
- `measure()` advance width for a known string in a bundled font matches
  fontkit's own `layout()` result to within 0.01mm.
- `fit()` in `shrink` mode reduces a 40-char name from 24pt until it fits 80mm and
  never goes below `minFontSizePt`.
- `fit()` returns `overflowed: true` when the floor is hit and the run still
  exceeds the box — this specific case has its own test.
- `fit()` in `wrap` mode breaks `"Alexander Featherstonehaugh"` into 2 lines at the
  space, and never mid-word unless a single word alone exceeds the box.
- `anchor: 'center'` keeps the text block's centre fixed as the size shrinks;
  `anchor: 'left'` keeps its left edge fixed. Both asserted numerically.

---

### Phase 4 — PDF renderer (still no UI) ⟵ the product
**Do:** `render/pdf/embedFonts.ts`, `drawIcon.ts`, `renderPdf.ts`, and
`imposition/paginate.ts`. Build a fixture harness that goes fixture CSV +
hardcoded template → `.pdf` on disk, runnable via `npm run test`.

`toPdfPoint(p, pageHeightMm)` is the sole y-flip: `{ x: mmToPt(p.x), y: mmToPt(pageHeightMm - p.y) }`.

**Accept (the PDF smoke test):**
- 150-guest fixture, 8-up sheet → PDF with exactly 19 pages, each 595.28 × 841.89pt.
- Extracted text from page 1 contains the first 8 guest names.
- Generation completes in **< 3.0s** (asserted in the test).
- Each embedded font appears exactly once in the document's font resources.
- A tent-fold fixture: the back-panel name renders at the transform from Phase 1,
  with `rotate: degrees(180)`. Confirm the drawn origin visually once, then lock it
  with a coordinate assertion.
- Fold guides render dashed via `drawLine({ dashArray })`; crop marks at 0.25pt.
- An icon path renders via `drawSvgPath` at the right position — **verify pdf-lib's
  y-orientation for `drawSvgPath` empirically here** rather than assuming it, and
  encode the finding in the test.
- Output opens in a real PDF viewer with selectable text.

---

### Phase 5 — SVG renderers (read-only)
**Do:** `ElementView.tsx`, `GuidesLayer.tsx`, `SheetPreview.tsx`. Load fonts into
the document via `FontFace` from the same `ArrayBuffer` the PDF path uses.
`<svg viewBox="0 0 210 297" width="210mm">` — mm units straight through, no scaling
math in the renderer.

**Accept:** Same fixture + template renders on screen and, side by side with the
Phase 4 PDF, matches: same card count per sheet, same font sizes, same line breaks,
same crop/fold marks. The bleed guide appears on screen and is absent from the PDF.

---

### Phase 6 — Editor
**Do:** `CardCanvas.tsx`, `useDragElement.ts`, `SelectionHandles.tsx`,
`state/store.ts`, `state/history.ts`.

**Accept:** Add/select/move/resize/delete/duplicate/reorder all work. Pointer deltas
convert to mm correctly at any zoom. Snapping to card edges, centre, fold axis and
sibling edges, with a toggle. Arrow nudge 1mm / 0.1mm with Shift. Ctrl+Z and
Ctrl+Shift+Z traverse 50 states. Dragging with 200 guests loaded holds 60fps —
because the editor canvas renders one card, not the sheet.

---

### Phase 7 — Sidebar, state wiring, persistence
**Do:** All of `ui/`, plus `state/persist.ts` and `state/blobStore.ts`.

**Accept:** Full loop works in the browser: upload `guests-150.csv` → design a
template → geometry suggestions apply on click → preview updates live → download a
correct PDF. Refresh restores everything including uploaded fonts (from IndexedDB).
Clear-all-data wipes both stores and reloads. A corrupt or unknown-version
`plaque.v1` value is discarded with a notice, never a crash loop.

---

### Phase 8 — Icons and fonts UI
**Do:** `IconRulesPanel.tsx`, `FontsPanel.tsx`, `assets/icons/index.ts`.

**Accept:** Eight bundled icons render identically in SVG and PDF. An uploaded
path-based SVG works end to end. An uploaded SVG containing `<image>` or `<text>`
is rejected with a message naming the reason. An uploaded `.otf` renders in both
preview and PDF. A `.woff2` is rejected by the file picker with the accepted
formats stated.

---

### Phase 9 — Ship
**Do:** `DesktopGate.tsx`, `ClearDataButton.tsx`, `WarningsList.tsx`, first-run
local-data notice, the NFR-1 bundle-origin test, README with screenshots, GitHub
Pages deploy in CI.

**Accept:** All five "done" criteria in `<key_requirements>` pass. The built bundle
contains no external origins. Sub-1024px shows the gate. Print one sheet at 100%
scale and measure the cards with a ruler — this is the only test that catches a
unit-conversion error that is self-consistent throughout the code.

---

## Known deferrals (do not build in v1)
Per-guest overrides · multi-select in the editor · `.woff2` · duplex/double-sided ·
escort cards, menus, table numbers · PDF-proof preview tab · touch editing ·
non-Latin script shaping beyond what fontkit gives for free · JSON project
export/import.
</implementation_steps>

<build_notes>
## What was built differently, and why

The spec above is the plan as written. These are the places the build departed
from it, each because the plan was wrong rather than because it was hard.

**Vertical folds do not invert.** The spec said a vertical fold mirrors the back
panel. It does — and that is exactly why inversion cannot apply to it. Folding a
sheet about a vertical axis turns the back panel's artwork into a mirror image,
and no rotation fixes mirrored glyphs. `invertBackPanel` now applies only to a
horizontal fold; a vertical fold gets panels and a fold guide but no inversion,
and the UI disables the toggle and says why. See `core/geometry/fold.ts`.

**`FitConfig.anchor` was removed.** The spec gave text fitting its own anchor
setting alongside `align`/`vAlign`. They are the same control: text is laid out
inside a fixed box, so a centred block already keeps its centre as it shrinks and
a right-aligned one already keeps its right edge. Two settings that can
contradict each other is a bug waiting to happen. The behaviour the anchor was
for is delivered by `align`/`vAlign`, and the inspector says so.

**Icons carry a knockout path and their own viewBox.** Two discoveries during
Phase 8. First, PDF fills with the nonzero rule, so the "free from" diagonal bar
merged into the silhouette and the icons read as solid blobs — the bar is now a
separate path painted in the card's background colour. Second, an uploaded SVG
is not in a 24×24 box, and rescaling arbitrary path data means re-implementing
every path command including elliptical arcs; icons now carry their viewBox and
the renderers fit it. `core/template/iconFit.ts` is shared by both.

**The editor shows folded cards upright.** The spec implied the canvas would show
the card as printed. Editing against a point-reflected back panel means every
drag fights the coordinate system. `CardCanvas` resolves with
`invertBackPanel: false`; inversion is applied at imposition, and the geometry
panel explains that.

**Default icon rules match aliases, not labels.** The first end-to-end render
showed no icon for gluten-free, dairy-free or nut-free: the rules matched icon
labels ("Gluten free") and the CSV said "Gluten-Free". Each bundled icon now
lists the spellings a guest list actually uses.

**The starting template is empty.** It was seeded from `defaultTemplate([])`,
which produced one text element bound to an empty string — and that made
`setCsv`'s "template is empty" guard never fire, so nothing ever rendered. The
initial template is now genuinely empty and the default is built on first upload.

**The zero-backend test checks hosts, not URLs.** Scanning the bundle for any
`http(s)://` string fails on documentation links inside React and pdf-lib error
messages. `src/offline.test.ts` allows a small, commented list of hosts that
appear as inert strings, fails on any other host, and separately asserts that no
`fetch()` is given an absolute URL.

**Phases 6, 7 and 8 were built and committed together.** The sidebar could not
compile without the icon and font panels it imports.

**Two extra core modules.** `geometry/transform.ts` (exact 90-degree rotation
without floating-point dust) and `template/snap.ts`, `template/iconFit.ts`,
`text/layout.ts` — all pure and tested, all extracted so both renderers share one
implementation rather than two that drift.

## Verified, not assumed

- `drawSvgPath` emits `s 0 0 -s 0 0 cm`: SVG path coordinates run downward from
  the anchor point. Confirmed by inflating the content stream, then pinned by a
  test.
- pdf-lib builds its text matrix with `Math.cos`/`Math.sin`, so a 180° rotation
  has 1.2e-16 in the off-diagonal terms. The test matches loosely on purpose.
- Papaparse calls `transformHeader` more than once per parse, so deduplication
  state kept across those calls comes out wrong. Parsing runs in array mode and
  does the header pass itself.
- Papaparse auto-detects semicolons and tabs, so those exports need no warning.
- 150 guests, 19 A4 pages: 80KB, ~480ms. The budget was 3.0s.
- pdf-lib emits a second image XObject as a soft mask for an image with alpha,
  so counting XObjects to prove deduplication is brittle. The test asserts the
  count does not grow with the number of cards instead.

## Added after the first release

Requested once the app was usable, and built on the same rules.

**Image elements.** A fifth element kind: upload a PNG or JPEG, drag and resize
it like anything else, with `contain`/`stretch` and an opacity for watermarks.
Bytes live in IndexedDB beside the fonts; `embedImages` in the PDF renderer
embeds each distinct image once per document however many cards use it. Only
PNG and JPEG are accepted, because those are what a PDF embeds directly and
silently re-encoding someone's artwork is worse than saying so. The same image
appears on every card — per-guest images from a column were considered and
deferred.

**A shrink anchor separate from alignment.** Reinstated after being cut, and
built so the two cannot contradict: `align` decides how lines sit relative to
each other, `anchor` decides where the whole block sits in the box, and the
default `"align"` collapses them into the single control the original design
had. Centre-aligned lines can now shrink toward the left edge.

**Icon rules are not only dietary.** The panel was already backed by
any-column matching; it was named and worded as though it were not. Renamed to
"Icon rules", with a switcher across every icon element on the card so several
columns can drive several icons without the panel silently following the
selection.

Deliberately not built: a print button. The PDF downloads and the system viewer
prints it, which is one step and no new failure mode.
</build_notes>
</implementation_steps>
