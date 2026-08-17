# Plaque

Turn a guest CSV into print-ready place card PDFs. Everything runs in your
browser — no account, no upload, no server. Your guest list never leaves your
device.

- Design one card in a freeform editor, bind text to any CSV column.
- Any card size, any fold, custom bleed and margins.
- Layout suggestions that maximise cards per sheet.
- Crop marks, cut lines and fold guides on A4 or Letter.
- Vector PDF with embedded fonts — text stays selectable and sharp at any size.

## Development

```sh
npm install
npm run dev        # http://localhost:5173
npm run test       # vitest, including the PDF smoke test
npm run build      # static output in dist/
```

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
  fitting, CSV and imposition logic, and all the unit tests.
- `src/render/` — the two renderers. Read-only consumers of `core/`.
- `src/state/` — zustand store, undo history, localStorage and IndexedDB.
- `src/ui/` — the sidebar panels and app chrome.

Full design spec: [docs/superpowers/specs/2026-08-17-plaque-design.md](docs/superpowers/specs/2026-08-17-plaque-design.md)

## Licence

MIT. Bundled fonts and icons carry their own licences — see
`src/assets/fonts/LICENSES.md`.
