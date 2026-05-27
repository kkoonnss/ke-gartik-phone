# v3 Fix-Up Completion Note

Agent: fix-up-agent (Sonnet sub-agent)
Date: 2026-05-26

## Gap Status

### BLOCKER 1: Kick button missing from player list
**Status: FIXED**
File: `public/js/host.js`
Lines: ~146-157 (inside `renderPlayers()`)

Added a `<button class="host__player-kick">×</button>` element for every non-host player in the `renderPlayers()` loop. Click handler calls `confirm('Kick {name}?')` then `socket.emit('room:kick', { playerId: p.id })` using `getSocket()`. Host player still gets the star marker only — no kick button. The socket is obtained fresh via `getSocket()` at click time, consistent with every other event emit in host.js.

### BLOCKER 2: Custom prompts textarea has no listener
**Status: FIXED**
File: `public/js/host.js`
Listener: lines ~584-600 (item 8 inside `init()`)
State sync: lines ~190-198 (inside `applyState()`)

- Input listener on `mCustomPrompts`: debounced 500ms, splits by newline, trims, filters empty, slices to 100 entries, each entry sliced to 300 chars, emits `room:prompts { prompts }` — matches CONTRACT_v3 §2 and §13 exactly.
- `applyState()` sync: only when `state.state === 'lobby'` and `document.activeElement !== mCustomPrompts` (avoids mid-type overwrite). Joins server array with `\n` for comparison and assignment.

### BLOCKER 3: Animation FPS input has no listener
**Status: FIXED**
File: `public/js/host.js`
Listener: lines ~602-611 (item 9 inside `init()`)
State sync: lines ~199-204 (inside `applyState()`)
Sub-panel visibility: line ~240 (inside `applyModeSubPanels()`)

- `change` listener on `mAnimationFps`: clamps to 1-12 (with fallback default 3 if NaN), writes clamped value back to input, emits `room:animation-fps { fps }` — matches CONTRACT_v3 §2 and §13.
- `applyState()` sync: only in lobby, only when value differs from server (string comparison). Guards with `mAnimationFps` null check since the DOM element may not exist.
- `applyModeSubPanels()`: added `if (mAnimationFpsWrap) mAnimationFpsWrap.hidden = (mode !== 'animation')`. Guarded with null check in case DOM element is absent.

### MINOR 4: Sound toggle never mounted
**Status: FIXED**
Files: `public/js/play.js` line ~1279, `public/js/lobby.js` line ~133

- `play.js`: `import('./sounds.js').then(m => m.mountSoundToggle(document.body)).catch(() => {})` added at the end of `init()`, after all socket listeners are wired.
- `lobby.js`: same one-liner added at the end of the file, after the join-form submit handler.
- Both use `.catch(() => {})` to swallow silently if sounds.js fails to load.
- `host.js` was intentionally skipped per brief ("lobby+play is enough").

### COSMETIC: Dead DOM refs mVoteTally / mVoteTallyBody
**Status: FIXED (comment added)**
File: `public/js/host.js`
Lines: ~52-53

Added inline comments `// Reserved — vote tally rendered by album.js` on both `mVoteTally` and `mVoteTallyBody` declarations. Refs kept (not deleted) to avoid breaking any future host.js code that might reference them, and to preserve the DOM capture pattern that album.js relies on for those elements.

## Tradeoffs

- **`mAnimationFpsWrap` null guard**: The show/hide call in `applyModeSubPanels` wraps `mAnimationFpsWrap` in a null check (`if (mAnimationFpsWrap)`). This is consistent with how optional v2 DOM refs are handled — if the HTML element hasn't been added to host.html yet, the JS won't crash.
- **Custom prompts debounce timer scoped inside `init()`**: `_customPromptsTimer` is declared as a local `let` inside `init()`. This is fine because `init()` runs once and the closure captures the variable correctly for the lifetime of the page.
- **Animation FPS `NaN` fallback**: If `mAnimationFps.value` parses to `NaN` (e.g. empty field), `raw || 3` substitutes 3, matching the CONTRACT default. This is a conservative fallback.
- **`applyState()` custom prompts sync**: Uses `null/undefined` check on `state.customPrompts` — if server returns `null` (no custom prompts set), server value is treated as empty string, which correctly clears the textarea when another client removes all prompts.
