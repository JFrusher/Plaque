# Plaque

Turn a guest CSV into print-ready place card PDFs. Everything runs in your
browser — no account, no upload, no server. Your guest list never leaves your
device.

![Plaque, with a tent card design and the imposed sheet beside it](docs/screenshot.png)

- Design one card in a freeform editor. Mix fixed text with `{{Column}}` tokens
  from your CSV, in any element.
- Drop in a monogram, crest or venue mark as a PNG or JPEG. Fill the box and
  crop it by eye — drag the artwork, wheel to zoom — or fit it to the card, to
  the panel, or to its own natural size in one press. Shift keeps a box's shape
  while you resize it.
- Hide the sheet pane when you want the whole window for the card, and zoom in
  on the work. Anything that leaves the card, or straddles the fold, says so.
- Any card size, any fold position, custom bleed and margins — with layout
  suggestions that work out how to waste the least card stock.
- Tent cards print the back panel rotated 180°, so it reads from across the
  table.
- Names that do not fit shrink, wrap, or tell you which guests are a problem —
  they never quietly become illegible. Choose the point they shrink around.
- Icons mapped from any column — dietary, entrée, anything — with your own SVGs
  if you want them.
- Vector PDF with embedded fonts: text stays selectable and sharp at any size.
- Save the whole job — design, guest list and uploads — as one `.plaque.json`
  file you can move between machines.

**New to Plaque? Start with the [User Guide](USER_GUIDE.md)** — how to build a
card, lay out a sheet, and print it at the right size.

## Development

```sh
npm install
npm run dev        # http://localhost:5173
npm run test       # vitest, including the PDF smoke test
npm run build      # static output in dist/, with both build gates
npm run sample     # writes sample-flat.pdf and sample-tent.pdf from the fixtures
npm run cli -- build fixtures/job.plaque.json -o out.pdf   # headless, same core
```

`npm run build` will not produce a bundle if either gate fails:

- **Data gate** (`npm run validate:data`) — a contributed preset with a bad
  field, or two presets with the same id, stops the build and names the file and
  the field.
- **Offline gate** (`npm run gate:offline`) — the built bundle is scanned for any
  host it could talk to, and for `fetch`, `WebSocket`, `sendBeacon`,
  `XMLHttpRequest` or `EventSource`. A guest list leaving the device is the one
  bug this project cannot ship, so it is checked mechanically rather than
  promised in a comment.

`dist/` is a plain static bundle. It runs from any host, or straight off the
filesystem.

## How it fits together

A single scene graph in millimetres is the source of truth. Two renderers
consume it and neither owns any layout logic:

```
CSV rows ─┐
          ├─> bindings ─> card scenes ─> paginate ─> sheets ─┬─> SVG (screen)
template ─┘                                                 └─> pdf-lib (export)
```

- `src/core/` — pure TypeScript. No React, no DOM. All the geometry, text
  fitting, CSV and imposition logic, and nearly all the tests. `core/job.ts` is
  the whole pipeline in one function, which is why the browser and the CLI cannot
  drift apart.
- `src/render/` — the two renderers. Read-only consumers of `core/`.
- `src/state/` — zustand store, undo history and IndexedDB.
- `src/ui/` — the sidebar panels and app chrome.
- `src/data/` — contributed data packs as JSON: card sizes, pre-cut stock.
- `templates/` — the starter gallery. Every file here is also a test fixture.

Three rules hold the design together:

1. Every stored coordinate is a millimetre, top-left origin, y downward.
2. `src/render/pdf/renderPdf.ts` is the only file that flips the y-axis for
   PDF's bottom-left origin.
3. Font size and line breaks are decided once, in `src/core/text/fit.ts`, from
   fontkit metrics — never from the browser's own text layout. That is what
   stops the preview and the printed sheet from disagreeing.

These are enforced, not just documented: `src/invariants.test.ts` fails the
build if a second file flips the y axis, if anything but `core/text/measure`
imports fontkit, if a renderer decides a size, or if `core/` reaches for React
or the DOM.