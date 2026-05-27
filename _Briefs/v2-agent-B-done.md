# v2 Agent B — Done Report

## Methods added to `public/js/canvas.js`

All three methods are exported in the return value of `initCanvas` alongside the existing `getDataUrl` and `clear`.

### `loadImage(dataUri)` — async, returns Promise
- Creates a `new Image()`, sets `src = dataUri`, resolves on `onload`, rejects on `onerror`.
- Before drawing: fills the canvas with `#ffffff` so transparent PNGs/SVGs have a clean white background.
- Draws the image via `drawImage(img, 0, 0, W, H)` — stretches to fill 720x540. Sources are expected to match this resolution per the contract.
- Aborts any in-progress pointer stroke (`isDrawing = false`, `strokePoints = []`) before painting.
- Resets undo stack (`undoStack.length = 0`) then calls `saveSnapshot()` to push the loaded state as the new baseline. The player can undo their own strokes but cannot undo past this baseline.
- Guards against non-string, empty, or non-`data:` URIs — rejects immediately with a descriptive message without touching canvas state.

### `applyEraseRect({ x, y, w, h })` — synchronous
- Guards: if `w <= 0` or `h <= 0` (including falsy) the function returns immediately without side effects.
- Calls `saveSnapshot()` first so the erase is undoable by the player.
- Fills the rect with `ctx.fillStyle = '#ffffff'` in internal 720x540 canvas coordinates, matching the contract spec in section 10.

### `setStartImage(dataUri)` — async, returns Promise
- Calls `clear()` first (wipes canvas + undo stack completely, aborts any stroke).
- Then calls `loadImage(dataUri)` and returns its Promise.
- Net result: canvas shows only the loaded image, undo stack baseline is that image, nothing undoable before it.

## Edge cases handled

| Edge case | Handling |
|---|---|
| `loadImage` called mid-stroke | Aborts stroke (`isDrawing=false`, `strokePoints=[]`) before painting |
| Invalid / malformed data URI | Rejects with descriptive Error; canvas state untouched |
| `onerror` on image decode | Rejects with descriptive Error |
| `applyEraseRect` with zero or negative w/h | Early return, no snapshot pushed |
| `applyEraseRect` before any image loaded | Works fine — just erases from whatever white blank is there |
| `setStartImage` on already-in-use canvas | `clear()` fully resets before load |
| PNG/SVG data URIs (Background mode) | White fill before `drawImage` handles transparency |
| Undo stack baseline | `undoStack.length = 0` + `saveSnapshot()` after image paint — user can undo strokes but not past the image |

## Existing behavior preserved

- `getDataUrl` iterative quality-reduction loop is completely untouched.
- `clear()` is completely untouched.
- All pointer event handlers, stroke smoothing (quadraticCurveTo), undo button, clear button, color/brush toolbar — all untouched.
- Internal canvas resolution stays 720x540.

## Notes for Agent C (play.js — caller)

The API for a drawing phase that uses `prevImage` and `eraseRect` (Co-Op, Missing Piece, Background) should look like:

```js
// On receiving phase:assignment with prevImage + eraseRect:
if (assignment.prevImage) {
  if (assignment.eraseRect) {
    // setStartImage then applyEraseRect
    await canvas.setStartImage(assignment.prevImage);
    canvas.applyEraseRect(assignment.eraseRect);
  } else {
    await canvas.setStartImage(assignment.prevImage);
  }
} else {
  // No image: just ensure canvas is clear
  canvas.clear();
}
```

- Always `await` `loadImage` / `setStartImage` before calling `applyEraseRect`. The erase must happen after the image is painted; calling it before resolves would erase white-on-white (harmless but useless).
- `applyEraseRect` pushes to the undo stack, so the player can undo the erase. This matches the brief. If Co-Op/Background ever need a non-undoable erase, a separate path would be needed — not required per current contract.
- Both `loadImage` and `setStartImage` return Promises that reject on failure. Agent C should `.catch()` and show a user-visible fallback (e.g., render with blank canvas) rather than silently ignoring the rejection.
- `eraseRect` coordinates are 720x540 internal space — pass them directly from the socket event payload without scaling.

## Contract concerns

None. No issues found. The contract is internally consistent for Agent B's scope. Proceeding was correct.
