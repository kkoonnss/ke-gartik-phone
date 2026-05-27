# v2 Agent C — Done Report

## Phase Handling Table

| Phase | Screen Used | Key Behaviour | Auto-Submit |
|---|---|---|---|
| `write` | `#write-screen` | Unchanged v1 | Yes (deadline-based) |
| `draw` | `#draw-screen` | Unchanged v1; now calls `_initDrawScreen` helper + `clearDrawBanners()` | Yes |
| `knockoff-draw` | `#draw-screen` | Unchanged v1; routed through `renderDraw` | Yes |
| `describe` | `#describe-screen` | Unchanged v1 | Yes |
| `knockoff-show` | `#knockoff-show-screen` | Unchanged v1 | N/A (timer only) |
| `continue` | `#write-screen` | Sets `#write-prompt-label` to `Previous: "…" — Continue the story:`; placeholder hints at continuation; submits as phase `continue` | Yes |
| `coop-draw` | `#draw-screen` | Awaits `canvasInstance.setStartImage(prevImage)` before scheduling auto-submit; graceful error toast on decode failure | Yes |
| `masterpiece-draw` | `#draw-screen` | No deadline — countdown hidden, "No time limit" banner injected; NO `scheduleAutoSubmit` call; manual submit only | NO |
| `missingpiece-draw` | `#draw-screen` | Awaits `setStartImage(prevImage)`, then calls `applyEraseRect(eraseRect)`; shows text prompt only on round ≤ 1 | Yes |
| `background-draw` | `#draw-screen` | Awaits `setStartImage(prevImage)` (background data URI); shows master prompt in `#draw-prompt-display` | Yes |

## Architecture Notes

- `_initDrawScreen(phaseKey)` is a new shared helper that: (1) restores `draw-countdown` visibility (un-does masterpiece's `hidden`), (2) init/re-inits the canvas, (3) wires the submit button. All draw renders use it.
- `clearDrawBanners()` / `injectDrawBanner()` manage a single `#draw-banner` `<div>` injected via JS before `#draw-submit`. play.html is untouched.
- For async draw phases (`renderCoopDraw`, `renderMissingpieceDraw`, `renderBackgroundDraw`): countdown and submit wiring happen before the `await`, so the player sees the screen immediately. `scheduleAutoSubmit` is deferred until after the image loads so the closure captures the correct canvas state.

## Edge Cases Hit

1. **Masterpiece countdown visibility leak**: `_initDrawScreen` unconditionally removes `hidden` from `#draw-countdown`. For masterpiece, `renderMasterpieceDraw` calls `_initDrawScreen` first, then immediately re-hides the countdown. Order matters — documented in code.
2. **prevImage decode failure**: All async draw renderers catch `setStartImage` rejection, log to console, show a 3-second toast, and fall back to blank canvas. The phase still proceeds normally.
3. **eraseRect without prevImage**: `renderMissingpieceDraw` guards against this (warns to console, skips the erase). Per CONTRACT §9 this shouldn't happen (round 1 has no prevImage and no eraseRect) but the guard is there.
4. **Reconnect during masterpiece-draw**: Server re-emits `phase:assignment` on rejoin. `hasSubmitted` is reset on every `phase:assignment` event. `applyState` routes to `renderMasterpieceDraw` again, which re-hides the countdown and re-shows the banner. No auto-submit fires.
5. **prevSlide.type === 'drawing' in coop-draw**: The `#draw-prompt-display` receives `prevSlide.content` (the data URI). This is technically valid per contract (prevSlide for coop is the previous drawing), so it would display the raw data URI string — not ideal but safe. Agent A should send `prevSlide: null` or a text slide for coop-draw, not a drawing slide, per §9.

## Manual Test Instructions

### 1. `continue` (Story mode)
1. Start a Story game (2+ players).
2. Round 0: players see the standard write screen with default label.
3. Round 1+: players should see `#write-prompt-label` updated to `Previous: "…" — Continue the story:` with the previous player's sentence.
4. Submit and verify `phase:submit` is emitted with `phase: 'continue'`.

### 2. `coop-draw` (Co-Op mode)
1. Start a Co-Op game.
2. After the first `draw` round, round 2 should emit `coop-draw` with `prevImage`.
3. The draw screen should open with the previous drawing already painted on the canvas.
4. Player can draw on top. Submit sends a JPEG of the combined image.
5. Test: pass an invalid data URI as `prevImage` — toast should appear and canvas should be blank.

### 3. `masterpiece-draw` (Masterpiece mode)
1. Start a Masterpiece game (set a master prompt in host settings).
2. Players get the draw screen; `#draw-countdown` should be hidden.
3. A "No time limit — submit when you're done" banner should appear above the SUBMIT button.
4. Clicking SUBMIT sends `phase:submit`. Waiting should NOT auto-submit.
5. Host can skip via `phase:skip`; player should move to spectator screen on next `room:state`.

### 4. `missingpiece-draw` (Missing Piece mode)
1. Start a Missing Piece game (3+ players recommended so round 2 fires).
2. Round 1 (`missingpiece-draw`): canvas blank, text prompt visible in `#draw-prompt-display`.
3. Round 2+: canvas pre-filled with previous drawing, with a white rectangle erased from it. Verify the rect position matches what the server computed.
4. Player draws in/around the hole. Submit sends the combined JPEG.

### 5. `background-draw` (Background mode)
1. Start a Background game, pick a background (e.g. grid-light) and a master prompt.
2. Players get the draw screen with the background image pre-loaded.
3. Master prompt text visible in `#draw-prompt-display`.
4. Players draw on top of the background. Submit sends the combined JPEG.

### General regression check
- Run a Classic game end-to-end: write → draw → describe → reveal. All v1 phases must work identically.
- Run a Knockoff game: write → knockoff-show → knockoff-draw → reveal.
