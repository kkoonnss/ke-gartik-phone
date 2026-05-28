# v0.5 Canvas Agent — Done Brief

## Tools Added

Five drawing tools selectable from the toolbar:

- **Brush** (default) — existing freehand stroke with quadraticCurveTo smoothing, unchanged
- **Fill** — single-click bucket flood fill using BFS queue, current color
- **Rect** — press-drag-release draws an outlined rectangle
- **Ellipse** — press-drag-release draws an outlined ellipse bounded by the drag box
- **Line** — press-drag-release draws a straight line

## Shape Preview Implementation

Shape tools (rect, ellipse, line) use a three-phase approach:

1. **pointerdown**: call `saveSnapshot()` which pushes the current canvas state onto `undoStack`; store a reference to that ImageData as `shapeSnapshot`; record `shapeStartX/Y`
2. **pointermove**: call `ctx.putImageData(shapeSnapshot)` to restore the pre-shape canvas, then call `drawShape()` to render the current preview — this gives a live rubber-band effect without accumulating pixels
3. **pointerup**: restore snapshot one final time, then call `drawShape()` with the final coordinates to commit. The snapshot that was pushed in step 1 serves as the undo baseline — one undo removes the whole shape. If drag distance was <= 1px on both axes the snapshot is popped back off the undo stack (no phantom undo entries for zero-drag taps).

`drawShape()` uses `ctx.strokeRect()` for rect, `ctx.ellipse()` for ellipse, and `ctx.moveTo()/lineTo()` for line. All respect `currentColor` and `currentSize`.

## Flood Fill Implementation

`floodFill(startX, startY, fillColorHex)` in canvas.js:

- Calls `ctx.getImageData(0, 0, 720, 540)` once to get the full pixel buffer
- Parses the hex fill color to RGBA (alpha always 255)
- Samples the target color at the click pixel
- Guards: out-of-bounds click returns early; if fill color matches target color within tolerance (32 per channel), returns early (no-op, no infinite loop)
- BFS using two pre-allocated typed arrays: `Int32Array(W*H)` for the pixel queue, `Uint8Array(W*H)` as a visited bitset — no recursion, no stack overflow risk at 720x540
- 4-connected expansion (up/down/left/right), clamped at canvas edges
- Color match uses per-channel tolerance of 32 to handle anti-aliased edges
- Calls `ctx.putImageData()` once after BFS completes (single write)

Undo integration: `saveSnapshot()` is called before `floodFill()` in the pointerdown handler so the fill is a single undoable step.

## Undo Integration Per Tool

| Tool    | When snapshot pushed                          | Undo removes                     |
|---------|-----------------------------------------------|----------------------------------|
| Brush   | `beginStroke()` called on pointerdown         | Entire stroke                    |
| Fill    | `saveSnapshot()` in pointerdown before fill   | Entire fill region               |
| Rect    | `saveSnapshot()` in pointerdown               | Entire rectangle                 |
| Ellipse | `saveSnapshot()` in pointerdown               | Entire ellipse                   |
| Line    | `saveSnapshot()` in pointerdown               | Entire line                      |

Zero-drag shape tap: snapshot is popped before returning so undo stack is not polluted.

Pointer cancel (e.g. phone call interruption on mobile): shape tools restore the pre-draw snapshot AND pop it from the undo stack — canvas returns to exactly the state before the aborted interaction.

## Toolbar Layout

Four rows inside `#draw-toolbar`:

1. **Tool row** (`.play__toolbar-tools`) — 5 square icon buttons (36x36px), SVG icons at 20x20px inside
2. **Color row** (`.play__toolbar-colors`) — 6 color swatch circles, unchanged
3. **Brush size row** (`.play__toolbar-brushes`) — 3 dot-size buttons, unchanged
4. **Action row** (`.play__toolbar-actions`) — UNDO + CLEAR buttons, unchanged

All rows use `.play__toolbar-row` (flex, wrap, centered) so they stack naturally on narrow phone screens. The existing sticky-bottom behavior on `<600px` screens applies to the whole `.play__toolbar` container as before.

## CSS Classes Added (styles.css)

`.play__toolbar-row` — shared flex row wrapper for each toolbar group (all four rows)

`.play__tool` — individual tool button: 36x36px, rounded corners, dark border, dim icon color; uses `var(--bg)` background and `var(--line-2)` border to match `.play__brush` aesthetic

`.play__tool svg` — 20x20px, pointer-events none

`.play__tool:hover` — border lightens to `var(--ink-dim)`, slight scale(1.08)

`.play__tool.active` — accent yellow border (`var(--accent)`), subtle yellow background tint via `color-mix`, icon color = `var(--accent)`, scale(1.05) — matches the project's yellow highlight convention used on color swatches and brush buttons

## Edge Cases Handled

- **Fill on same-color region**: guarded by tolerance check before BFS starts; returns immediately
- **Zero-drag shape click**: shape is not drawn; the undo snapshot is popped back off so the stack stays clean
- **Tool switch mid-stroke**: `abortCurrentInteraction()` is called from each tool button's click handler; for brush it sets `isDrawing=false` and clears `strokePoints`; for shape tools it restores the pre-shape snapshot and pops it from the undo stack
- **Pointer cancel**: shape tools restore snapshot + pop undo entry; brush calls `endStroke()` which finalizes the stroke normally (preserving partial work)
- **Out-of-bounds fill click**: coordinate clamped with early-return guard in `floodFill()`
- **Out-of-bounds shape drag**: canvas context natively clips drawing operations to canvas bounds; no additional clamping needed
- **loadImage / setStartImage / reset**: all call `clear()` which sets `shapeSnapshot = null` and `isDrawing = false` — no stale preview state possible

## Files Modified

- `public/js/canvas.js` — tool state, TOOLS array, shape functions, flood fill, updated pointer handlers, updated buildToolbar()
- `public/css/styles.css` — `.play__toolbar-row`, `.play__tool`, `.play__tool svg`, `.play__tool:hover`, `.play__tool.active`

## Files NOT Modified

play.js, host.js, host.html, play.html, server.js, theme.css, any other file.
