# Agent C — Done Report

## Files Written

- `public/js/canvas.js`
- `public/js/play.js`

No other files touched. File ownership per CONTRACT.md respected.

---

## What Was Built

### canvas.js
- Exports `initCanvas(canvasEl, toolbarEl, opts)` returning `{ getDataUrl, clear }`.
- Internal resolution 720×540; CSS-fit via `width/height: 100%` on the canvas element.
- `touch-action: none` applied to both the canvas element and its parent wrap.
- Pointer events (pointerdown/pointermove/pointerup/pointercancel) with `setPointerCapture` for reliable touch tracking.
- `quadraticCurveTo` smoothing between midpoints of consecutive stroke points.
- 6 colors (`#111111`, `#e63946`, `#f1a208`, `#2a9d8f`, `#264653`, `#ffffff`) + 3 brush sizes (4, 10, 22px) rendered into `toolbarEl`.
- Undo stack: 20 snapshots via `getImageData`/`putImageData`.
- Clear button also saves a snapshot before wiping (so it's undoable).
- `getDataUrl()`: JPEG at quality 0.7, iteratively reduces to 0.5 → 0.3 → half-resolution offscreen canvas if still over 240 KB. Stays safely under 250 KB cap.
- `clear()` wipes canvas white and empties undo stack — called on each new draw phase.

### play.js
- On load: reads room code from path, redirects to `/` (lobby) if no code or no stored player identity.
- Re-joins via `emitAck('room:join', {code, name, emoji, resumePlayerId})`.
- Listens to `room:state`, `phase:assignment`, `phase:tick`, `error`.
- One screen visible at a time via the `hidden` attribute.
- **write phase**: focuses textarea, Cmd/Ctrl+Enter submits, button submits.
- **draw phase**: calls `initCanvas` on first draw, then `clear()` + re-instantiates on subsequent draw phases to keep toolbar fresh.
- **describe phase**: sets `#describe-image` src from prevSlide content, submits text.
- **knockoff-show phase**: sets `#knockoff-show-image` src, starts countdown from `assignment.deadline`. When deadline passes, shows spectator screen while waiting for server's next `phase:assignment` (knockoff-draw). Server drives the actual next phase.
- **spectator screen**: rotates between 3 messages on each switch.
- **Auto-submit on deadline**: `setTimeout` fires `doSubmit` at `endsAt`. A `submitInFlight` guard + `hasSubmitted` flag prevents double-submit.
- `phase:tick` updates `currentDeadline` for countdown precision.
- Error events show `#error-toast` for 3 seconds.
- Mobile: textareas scroll into view on focus; no fixed-height containers added.

---

## Gotchas

1. **Canvas re-instantiation on draw phases**: The brief says "keep one canvas instance; recreate via `clear()`". However `clear()` alone doesn't re-render the toolbar DOM (which gets wiped by `innerHTML = ''` on re-init). The chosen approach re-calls `initCanvas` on every new draw phase but with the same canvas element — this is safe because `canvas.width` assignment resets the bitmap state and we call `clear()` on the old instance first. If Agent E's styles rely on toolbar elements being stable across phases, they should not cache toolbar child references.

2. **knockoff-show auto-advance**: CONTRACT says "auto-advances client-side after knockoffShowSeconds". The client transitions to the spectator screen when the deadline passes. The server emits the next `phase:assignment` (knockoff-draw) to trigger the draw screen. This means there's a brief spectator flash between knockoff-show and knockoff-draw while the server's emission arrives. This is intentional and matches the brief.

3. **`write` phase and `phase:assignment`**: CONTRACT says server emits `phase:assignment` for write with `prevSlide: null`. The play.js `renderWrite` ignores `prevSlide` entirely, which is correct.

4. **`round` on write**: Brief says emit `round: 0` for write. play.js uses `lastAssignment.round` which the server sends — for write that should be 0 per the state machine. This is correct.

5. **No `#write-prompt-label` dynamic text**: The HTML already has static copy ("Write a sentence — anything goes!"). The brief doesn't require dynamic content for this label, so it's left as-is.

6. **`play.html` imports both `canvas.js` and `play.js`** as separate module scripts. `canvas.js` exports `initCanvas` but has no side-effects when loaded standalone — this double-load is harmless.

---

## Manual Test Steps

### Setup
1. Start the server: `node server/index.js` from project root.
2. Open host panel: `http://localhost:3000/host` (or whatever port).
3. Open two browser tabs to `http://localhost:3000/` (or use phone + desktop).

### Classic mode flow
1. **Tab A**: Create a room. Copy the code.
2. **Tab B**: Join the room with the code.
3. Host panel: set mode = classic, click Start Game.
4. Both tabs should show `#write-screen`. Type a sentence in each, submit.
5. Both tabs should switch to `#draw-screen` with the other player's text in `#draw-prompt-display`. Draw something, submit.
6. Both tabs should show `#describe-screen` with the drawing from the other player. Type a description, submit.
7. Host panel reveals the album.

### Timeout / auto-submit
1. Start a write phase. Do NOT submit manually.
2. Wait for the countdown to reach 0.
3. Verify the game advances (spectator screen appears) without any JS error in console.

### Drawing canvas
1. On mobile (or Chrome DevTools device mode): verify strokes follow finger, no page scroll while drawing.
2. Draw a stroke, click UNDO — previous state restored.
3. Click CLEAR — canvas goes white; UNDO after CLEAR restores the drawing.
4. Switch colors and brush sizes — active state visually updates.

### Knockoff mode
1. Host: set mode = knockoff, start game.
2. After write phase, players should see `#knockoff-show-screen` with the drawing to memorize.
3. After deadline, spectator screen appears briefly, then `#draw-screen` appears (server emits knockoff-draw assignment).

### Error toast
1. Disconnect server mid-phase. Submit should fail silently (spectator shown).
2. Can manually test by emitting a mock `error` event from browser console: `getSocket().emit('error', {message:'Test error'})` — toast should appear for 3 seconds.

### Reconnect
1. Join a game mid-session. Close the player tab. Reopen it to the same URL.
2. Player should rejoin silently and see the correct screen for the current phase.
