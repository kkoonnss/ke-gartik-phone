# v2 Agent B — Canvas + Image Extensions

## Your scope
Extend the drawing canvas module with image-init and erase-rect capabilities, so Co-Op / Missing Piece / Background modes can pre-load a starting image and erase regions before the player draws.

## Files you own (edit ONLY this file)
- `public/js/canvas.js`

## Required reading
- `_Briefs/CONTRACT_v2.md` — sections 4 (phase:assignment payload), 10 (erase-rect algorithm), 16 (tech notes)
- Current `public/js/canvas.js` — understand what `initCanvas` returns

## What to add

Extend the return value of `initCanvas` to expose these new methods:

```js
{
  getDataUrl,                  // existing
  clear,                       // existing
  loadImage(dataUri),          // NEW — async; paints dataUri across the canvas, fits internal 720x540
  applyEraseRect({x, y, w, h}),// NEW — fills the rect with white (#ffffff)
  setStartImage(dataUri),      // NEW — convenience: clear() + loadImage(dataUri). Resets undo stack.
}
```

### `loadImage(dataUri)`
- Returns a Promise
- Decodes the image (use `new Image()`, set src, await onload)
- Draws it to fill the internal canvas (preserving aspect ratio is preferred but stretching to fill is acceptable if simpler — sources are 720x540 already)
- Resets the undo stack (so the user can't undo past the loaded image)
- Pushes the post-load state as the new undo baseline

### `applyEraseRect({x, y, w, h})`
- Synchronous
- Fills the given rect with `#ffffff`
- Rect coordinates are in internal canvas coordinates (720x540)
- Pushes onto undo stack so the user can undo the erase if they want

### `setStartImage(dataUri)`
- Wipes everything and starts from the loaded image
- Internally: `clear()` then `loadImage(dataUri)`
- Resets undo stack to start fresh (with the image as the baseline)

## Implementation notes

- Existing `getDataUrl` re-encoding loop (quality 0.7 → 0.5 → 0.3 → half-res) MUST keep working
- Image decoding must work for both JPEG data URIs (drawings) and PNG/SVG data URIs (backgrounds)
- If `loadImage` is called with a malformed URI, the promise should reject but not crash subsequent draws
- Undo stack management: a "baseline" state is established after `loadImage`. User can undo their strokes back to the baseline but not past it.

## Edge cases to handle

- `loadImage` called while user is mid-stroke — abort the stroke, complete the load
- `applyEraseRect` called before `loadImage` — just erase from whatever's currently there (probably white blank)
- Very small or zero-area rects — guard against it; if w<=0 or h<=0, do nothing
- DataUri that's actually invalid — catch in `.onerror`, reject the promise with a useful message
- Calling these methods on a canvas instance that was already cleared mid-game — should still work

## Definition of done

- Public API extended with three new methods
- Existing methods (`getDataUrl`, `clear`) behave identically to v1
- Image-init works on a sample 720x540 JPEG data URI
- Erase rect properly fills with white
- Undo stack handles the baseline state correctly
- File ownership respected — only `canvas.js`

## Report when done

Write `_Briefs/v2-agent-B-done.md` with: methods added, edge cases handled, any concerns about playing nice with Agent C's calling code.
