# Image manipulation and workspace — design

Extends the v1 design (`2026-08-17-plaque-design.md`). Three related gaps, one
spec because they share the card pane.

## The gaps

1. **Image manipulation is two radio buttons.** `ImageElement` carries
   `imageId`, `fit: "contain" | "stretch"` and `opacity`. There is no crop, no
   aspect lock while resizing, and no way to say "fill this box with the middle
   of the photo".
2. **The sheet pane is not optional.** `.workspace` is a hard
   `minmax(0,1fr) minmax(0,1fr)` grid. The card — the thing being designed —
   never gets more than half the window, and there is no zoom, so close work on
   a 24mm monogram is done at whatever scale the window happens to give.
3. **Nothing helps when artwork is the wrong size for the space.** An image
   element is inserted at a fixed 24×24mm at the card centre regardless of the
   artwork's shape, and an element that hangs off the card, or straddles the
   fold of a tent card, is reported by nothing.

## Decisions

| Decision | Choice |
|---|---|
| Crop model | Cover + focal point + zoom. Not a source rect, not free offset. |
| Rotation | Out of scope. |
| Resolution warnings (DPI, downsample, embedded weight) | Out of scope. |
| File format | Optional fields with defaults. No persist or project version bump. |
| Renderer parity | One pure fitter in `core/`, called by both renderers. |
| Overflow reporting | Advisory warning. Never blocks export. |

### Why cover + focus + zoom

The rejected alternatives, so they are not re-litigated:

- **Source rect** (store a normalized crop rect of the image, stretch it into
  the box) makes crop aspect and box aspect two independent facts. The moment
  either changes they disagree, and the code must either distort the artwork or
  silently rewrite the user's crop. Both are worse than the constraint.
- **Free offset + scale in mm** allows artwork placed anywhere relative to its
  box, gaps included. Resizing the box then breaks the composition, and the
  gaps it permits look like a rendering bug rather than a choice.

Cover + focus + zoom stores ratios, so the crop survives any box resize: a
60×40 box and a 40×60 box are both filled, both centred on the same part of the
picture. The cost, accepted: artwork cannot deliberately leave a gap or hang
outside its box.

## Components

### 1. `src/core/template/imageFit.ts`

Pure, no DOM, sibling of `iconFit.ts`.

```ts
export interface ImageCrop {
  fit: ImageFit;
  /** 1 = exactly fills the box. Clamped to 1..8. */
  zoom?: number;
  /** Which point of the artwork sits at the box centre. 0..1, default 0.5. */
  focusX?: number;
  focusY?: number;
}

export interface ImagePlacement {
  x: Mm;
  y: Mm;
  drawnW: Mm;
  drawnH: Mm;
  /** Non-null only when the drawn artwork exceeds the box. */
  clip: Rect | null;
}

export function fitImage(
  box: Rect,
  natural: { w: number; h: number },
  crop: ImageCrop,
): ImagePlacement;
```

- `contain` — delegates to `fitIcon`, `clip: null`. Byte-identical to today.
- `stretch` — returns the box, `clip: null`. Byte-identical to today.
- `cover` — `scale = max(box.w / natural.w, box.h / natural.h) × zoom`;
  `drawn = natural × scale`; the offset places `focus` at the box centre, then
  clamps so a drawn edge can never come inside the box; `clip = box`.
- Degenerate input (zero or negative box or natural size) returns a zero-size
  placement at the box origin, matching `fitIcon`.

Out-of-range `zoom` and `focus` are clamped, not rejected: a project file is
data from outside this build and must not be able to produce a broken draw.

### 2. Types

- `ImageFit` gains `"cover"`.
- `ImageElement` gains optional `zoom`, `focusX`, `focusY`.
- `ResolvedImage` carries the same three, passed through by `bindings.ts`.

Absent means `zoom: 1, focusX: 0.5, focusY: 0.5`. Optional-with-default is the
same mechanism `optical?`, `side?` and `rowScope?` already use, so no
`PROJECT_VERSION` bump, no `MIGRATIONS` entry, and every existing
`.plaque.json` and autosave record loads untouched.

### 3. Renderers

Both replace their local `fit === "stretch" ? … : fitIcon(…)` ternary with a
`fitImage` call:

- `src/render/svg/ElementView.tsx` — clips with a `<clipPath>` keyed on the
  element id when `clip` is non-null.
- `src/render/pdf/renderPdf.ts` — `pushGraphicsState()`, rectangle path,
  `clip()`, `endPath()`, `drawImage`, `popGraphicsState()`. Verified present in
  the installed `pdf-lib` 1.17.1.

Renderer agreement stays a property of the shared fitter rather than of two
implementations that happen to match.

### 4. Canvas interaction

**Aspect lock.** Holding Shift on a corner handle constrains the resize to the
box's aspect at drag start. Implemented in `applyDrag` in
`src/render/svg/useDragElement.ts` — pure and already tested — as a
`lockAspect` flag, so it applies to every element kind, not only images.

**Crop mode.** Entered by double-clicking an image element or the Inspector's
*Crop* button; left by Esc or clicking away.

- The artwork draws ghosted beyond the box, so what is being cut is visible.
- Drag pans `focus`. Wheel zooms.
- Store holds `cropId: ElementId | null`. Transient: not persisted, not part of
  a history snapshot.
- Focus and zoom writes go through the existing `beginEdit` + patch path, so
  one crop gesture produces exactly one undo entry — the same rule dragging
  already follows.
- Crop mode swaps the element's pointer handler rather than adding a modifier,
  so it cannot clash with the move drag.

### 5. Fit actions

In the Inspector's image section:

- **Fit to card** — box becomes the card, artwork aspect preserved under
  `contain` and `cover`.
- **Fit to panel** — via `panelOf(box, card)` and `panelBounds`, so on a tent
  card the element fits the half it is in instead of straddling the fold.
- **Match artwork shape** — keeps the box's area, takes the artwork's aspect.
- **Natural size** — the artwork at 1:1, 300 DPI, clamped to the card.

Plus, in `ImagesPanel`: assigning artwork to an element still sitting at its
untouched 24×24 default reshapes the box to the artwork's aspect. Only when
untouched. A box the user has sized is never silently rewritten.

### 6. `src/core/template/overflow.ts`

Pure. Reports elements whose box leaves the card, and elements that cross the
fold line from within a panel. Feeds App's existing `issues` memo alongside the
contrast and unbound-token checks, at `warning` severity.

Message only — no action buttons in `WarningsList`. The fixes are the Inspector
actions in §5, so the warnings list needs no new plumbing.

### 7. Workspace

- `sheetCollapsed: boolean` in the store, persisted beside `snapEnabled`.
  Missing in an older record reads as `false`, so `persist.ts` needs no version
  change.
- `.workspace` becomes `1fr auto` when collapsed; the sheet pane renders as a
  narrow strip carrying a re-open button.
- Collapsing gates the `currentSheet` paginate memo in `App.tsx`. A hidden pane
  that stops imposing on every keystroke is a real saving on a large job.
- The card pane gets a scrollable viewport and a `[– 100% +] [Fit]` toolbar.
  Ctrl/Cmd+wheel zooms; space-drag pans.
- Drag maths needs no change: `useDragElement` converts screen to millimetres
  through `getScreenCTM()`, which is already correct at any zoom, and the
  existing `ResizeObserver` keeps `mmPerPx` — and therefore handle size —
  right.

## Data flow

Unchanged in shape. The crop fields ride the existing path:

```
ImageElement (zoom, focusX, focusY)
  └─ bindings.resolveCard ─> ResolvedImage
       ├─ ElementView  ─ fitImage ─> <image> in <clipPath>
       └─ renderPdf    ─ fitImage ─> clipped drawImage
```

`scaleSheetContent` (printer calibration) keeps working untouched: the crop is
ratios plus a box, and the box is what gets scaled.

## Error handling

| Case | Behaviour |
|---|---|
| `zoom` or `focus` out of range in a loaded file | Clamped by `fitImage`. |
| Zero-size box or artwork | Zero-size placement, nothing drawn, no throw. |
| Missing image | Unchanged: the named red placeholder, export blocked. |
| Element hangs off the card | Advisory warning. Export proceeds. |

## Testing

Vitest, matching what the repo already does — pure logic, plus the PDF smoke
test. No React test machinery is introduced.

- `imageFit.test.ts` — cover fills the box at zoom 1 for both aspect
  directions; focus 0 and 1 clamp to the edges; zoom > 1 never leaves a gap;
  clamping of out-of-range input; `contain` and `stretch` unchanged against the
  current expectations.
- `overflow.test.ts` — off-card and fold-crossing detection, including an
  element legitimately spanning a card with no fold.
- `useDragElement.test.ts` — the aspect-locked branch of `applyDrag` for each
  corner.
- `renderPdf.test.ts` — a cropped image emits the clip operators and draws
  within its box.

## Build order

1. §1 → §2 → §3. Crop works end to end, unreachable from the UI.
2. §4 → §5. Crop and the fit actions become reachable.
3. §6. Standalone.
4. §7. Independent of the image work; could equally land first.
