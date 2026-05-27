# FIX-B Completion Note — v0.3 Pass 1

Agent: FIX-B  
Files edited: `public/js/canvas.js`, `public/js/play.js`  
Date: 2026-05-26

---

## Canvas Init Pattern — Before / After

**Before:**  
`_initDrawScreen` checked whether `canvasInstance` existed. If it did, it called `canvasInstance.clear()`, blanked `toolbarEl.innerHTML`, then called `initCanvas(canvasEl, toolbarEl)` again — creating a new instance and adding a fresh set of `pointerdown/pointermove/pointerup/pointercancel` listeners to the same `canvasEl`. After N draw phases, the element had N × 4 active listeners, each independently firing `beginStroke`.

**After:**  
- `initCanvas` registers pointer listeners exactly once. A new `buildToolbar()` internal helper is extracted so it can be called again without touching the element listeners.
- `canvas.js` exports a new `reset(opts?)` method. `reset()` calls `clear()`, resets tool state to defaults (black, size 4), calls `buildToolbar()` to refresh toolbar DOM, and optionally calls `loadImage(opts.startImage)` if a start image is provided. Does not add any event listeners.
- `play.js` adds `initCanvasOnce()`, called once from `init()` right after room code is validated. This is the single point where `initCanvas(canvasEl, toolbarEl)` is called for the page lifetime.
- `_initDrawScreen` now calls `canvasInstance.reset()` instead of re-calling `initCanvas`. Toolbar DOM is rebuilt safely (direct children of `toolbarEl`, no listener leak since button references are new each build).

---

## Fix Items Status

### M-1 (CRITICAL): Canvas pointer-listener accumulation
**Done.** `initCanvasOnce()` in `init()` + `reset()` in `_initDrawScreen`. Confirmed: `setStartImage` + `applyEraseRect` flow is unchanged — `reset()` clears to white, then callers invoke `setStartImage(prevImage)` which calls `loadImage` and pushes the undo baseline, then `applyEraseRect` adds the erase rect on top. No regression on coop-draw, missingpiece-draw, background-draw.

### M-2: Spectator-screen flash race
**Done.** `doSubmit` captures `submittedAssignment = lastAssignment` before the `emitAck` await. Both the success and catch paths only call `showScreen('spectator-screen')` if `lastAssignment === submittedAssignment`. If a new `phase:assignment` arrived during the in-flight submit, the check fails and the screen transition is skipped — the new phase renderer already updated UI.

### L-3: SCREENS array reuse comment
**Done.** A block comment above the `SCREENS` constant documents that `continue` reuses `write-screen` and all draw variants reuse `draw-screen`, and explains that only genuinely new HTML screens need to be added here.

### L-4: Reset `#write-input` placeholder in renderWrite
**Done.** `renderWrite` now explicitly sets `input.placeholder = 'A motion designer fighting a keyframe dragon...'` before focus. This resets any placeholder left by `renderContinue`'s `'Keep the story going...'`.

---

## Sound Hook Points Added

All hooks use the defensive `tryPlaySound(name)` helper, which dynamically imports `./sounds.js` and calls the named export if it exists; silently no-ops if the module is absent or throws.

| Hook | Location | Sound name |
|---|---|---|
| New phase assigned | `socket.on('phase:assignment')` handler | `playPhaseStart` |
| Submit succeeded | `doSubmit` try block, after `emitAck` resolves | `playSubmit` |
| Room enters reveal | `socket.on('room:state')`, on transition `prevState !== 'reveal' → 'reveal'` | `playReveal` |
| Player kicked | `socket.on('kicked')` handler | `playKicked` |

`tryPlaySound` is defined at module level and uses dynamic `import('./sounds.js')` — no hard dependency on the sounds module. FEAT-SND-CSS can ship `sounds.js` independently.

---

## Kicked Banner Implementation

`socket.on('kicked', ({ reason }) => {...})` in `play.js`:
- Creates a `position:fixed; inset:0; z-index:9999` overlay div (id=`kicked-overlay`) injected into `document.body`. No play.html changes needed.
- Shows title "You have been removed", the `reason` string (fallback: "Host removed you from the room."), and a large countdown number.
- Calls `tryPlaySound('playKicked')`.
- Runs a `setInterval` decrementing from 5 to 0, then calls `window.location.href = '/'`.
- Handles repeated `kicked` events safely: removes any existing `kicked-overlay` before injecting a new one.

---

## No Issues / Stops Required

All changes stayed within the `public/js/canvas.js` and `public/js/play.js` file boundary. No contract divergences found. Backward-compatible with all v1/v2 phase types.
