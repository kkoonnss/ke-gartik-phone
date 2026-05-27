# Agent C — Player UI + Drawing Canvas

## Your scope
Build the player game experience: phase rendering, write/describe text submission, and the drawing canvas with toolbar. Targets `public/play.html`.

## Files you own (write ONLY these)
- `public/js/play.js`
- `public/js/canvas.js`

## Pre-written files you read and target
- `public/play.html` — DOM IDs in `_Briefs/CONTRACT.md`
- `public/js/socket-client.js` — use exports

## Required reading
- `_Briefs/CONTRACT.md` — DOM IDs, socket events, mode variants (especially knockoff), validation caps (300 char text, 250KB JPEG)
- `_Briefs/ke-gartik-phone-scope.md`

## What to build

### `public/js/canvas.js` — Drawing tool module
Export a function `initCanvas(canvasEl, toolbarEl, opts)` that returns an object `{ getDataUrl, clear }`.

Features:
- Pointer events (works for mouse, touch, pen)
- Auto-fit canvas to its container, internal resolution 720×540 (CSS scales to fit while preserving aspect)
- Toolbar buttons rendered into `toolbarEl`:
  - 6 colors: `#111111` (black), `#e63946` (red), `#f1a208` (orange), `#2a9d8f` (teal), `#264653` (deep blue), `#ffffff` (white/eraser)
  - 3 brush sizes: 4px, 10px, 22px
  - Eraser is the white color
  - Undo button (stack of last 20 strokes)
  - Clear button
- Stroke smoothing: capture pointer-move into stroke points, draw `quadraticCurveTo` between midpoints for smoothness
- `getDataUrl()` returns JPEG data URI at quality 0.7. If result exceeds 240KB, lower quality and re-encode until ≤240KB (safe margin under 250KB cap)
- `clear()` wipes canvas and undo stack
- Disable pinch-zoom on the canvas itself (`touch-action: none` on the wrap)

### `public/js/play.js` — Player page controller
On load:
- Read code from `getRoomCodeFromPath()`
- If no stored playerId, redirect to `/?room=${code}`
- Otherwise `emitAck('room:join', {code, name, emoji, resumePlayerId})` to re-establish

Reactively show one screen at a time based on `room:state` + `phase:assignment`:

| Visible screen | When |
|---|---|
| `#waiting-screen` | `state.state === 'lobby'` |
| `#write-screen` | last `phase:assignment` had `phase: 'write'` AND not yet submitted |
| `#draw-screen` | last `phase:assignment` had `phase: 'draw'` or `'knockoff-draw'` AND not yet submitted |
| `#describe-screen` | last assignment had `phase: 'describe'` AND not yet submitted |
| `#knockoff-show-screen` | last assignment had `phase: 'knockoff-show'` (auto-advances client-side after `knockoffShowSeconds`) |
| `#spectator-screen` | player has submitted for the current phase OR state is reveal/ended |

Hide all other `.play__screen` sections (use the `hidden` attribute).

For each phase:
- **write**: show, prefill empty textarea, focus it. Wire submit button + Enter key (Cmd/Ctrl+Enter on textarea) to `emitAck('phase:submit', {phase:'write', round:0, content:trimmed})`. On success, switch to spectator.
- **draw**: instantiate canvas via `initCanvas(...)`. Show `prevSlide` content in `#draw-prompt-display` as plain text (it's a sentence). After submit: get data URL, emit `phase:submit` with `phase:'draw'` (or 'knockoff-draw' if last assignment was that), `content: dataUrl`.
- **describe**: show drawing in `#describe-image` (set src to prev slide content). Submit text.
- **knockoff-show**: set `#knockoff-show-image` src to prev slide content. Start a local countdown using `assignment.deadline`. When 0, transition to draw screen without server intervention (server emits next assignment).

Countdown rendering: derive seconds from current assignment's `deadline` (set on each `phase:assignment`), updated by `phase:tick`. Write the integer seconds into the relevant `#*-countdown` element.

Auto-submit-on-timeout: if the user hasn't submitted by `deadline`, auto-fire submit with the current canvas content / textarea value (or blank/`...` if empty). Server will accept whatever; if it rejects (timed out and server advanced), swallow silently.

Error handling: listen for `error` event, briefly show `#error-toast` for 3 seconds.

## Implementation notes
- Use ES module imports. `import { initCanvas } from './canvas.js'`.
- Keep one canvas instance; recreate via `clear()` on each new draw phase rather than re-instantiating.
- Mobile concerns:
  - On focus of textarea, scroll it into view
  - Submit button stays visible above the soft keyboard (CSS handles this via flex layout, but ensure no fixed-height containers)
- Spectator screen messages: rotate between "Nice work. Waiting on the others...", "Almost there...", "Don't peek 👀"

## Definition of done
- Two browsers can play through write → draw → describe (classic mode)
- Drawing on mobile works (pointer events, no scroll-jacking)
- Auto-submit on timeout doesn't double-submit
- File ownership respected — only `play.js` and `canvas.js`

## Report when done
Write `_Briefs/agent-C-done.md` with: files, gotchas, manual test steps.
