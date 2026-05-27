# CONTRACT_v2.md — Locked Inter-Module Contract for v1.1

**This is the v2 contract. It supersedes CONTRACT.md (v1) but is BACKWARD-COMPATIBLE: all v1 events and shapes still work, new fields are additive.**

If you are a sub-agent reading this for the v1.1 sprint: do NOT invent new events, rename existing ones, or change data shapes. If you believe a change is required, stop work and report it to the orchestrator. Other agents are building against this contract in parallel.

---

## 1. File Ownership for v1.1 Sprint

| Agent | Owns (you may write/edit ONLY these files) |
|---|---|
| A: Mode Engine | `server/game.js` (refactor), `server/rooms.js` (extend `serializeRoom`), all files under `server/modes/`, `server/imageutils.js` (new, helpers only) |
| B: Canvas + Image | `public/js/canvas.js` (extend with `loadImage`, `applyEraseRect`) |
| C: Player UI | `public/js/play.js` (extend with new phase handlers) |
| D: Reveal Player | `public/js/album.js` (extend with 4 layouts) |
| E: Host UI | `public/js/host.js` (extend with mode sub-panels) |
| F: Theming | `public/css/styles.css` (extend) and `public/css/theme.css` (light additions only) |
| G: Backgrounds + Prompts | `server/backgrounds.js` (new), `server/prompts.js` (extend, do not remove existing PROMPTS export) |
| H: Smoke Tester | `tests/smoke.js` (new), add `test` script to `package.json` (you may add this ONE field) |

**Shared / pre-written / DO NOT EDIT:**
- All four HTML files (`public/index.html`, `public/host.html`, `public/play.html`, `public/album.html`) EXCEPT Agent E may add NEW elements inside `#settings-panel` and `#reveal-panel` if a new mode requires them. Agent E must NOT touch existing IDs.
- `public/js/socket-client.js`
- `_Briefs/CONTRACT.md` (v1, frozen)
- `_Briefs/CONTRACT_v2.md` (this file)

If Agent E adds new HTML elements, they go inside the existing `#settings-panel` or `#reveal-panel` and follow the naming convention `#m-{purpose}` (e.g. `#m-secret-order`, `#m-master-prompt`, `#m-bg-picker`, `#m-knockoff-show`, `#m-speedrun-btn`, `#m-end-phase-btn`). Agent F styles these.

---

## 2. Mode Registry

```js
// server/modes/index.js
module.exports = {
  classic:      require('./classic'),
  knockoff:     require('./knockoff'),
  solo:         require('./solo'),
  story:        require('./story'),       // NEW
  animation:    require('./animation'),   // NEW
  coop:         require('./coop'),        // NEW
  masterpiece:  require('./masterpiece'), // NEW
  missingpiece: require('./missingpiece'),// NEW
  background:   require('./background'),  // NEW
  secret:       require('./secret'),      // NEW (mostly wraps classic)
  // speedrun is NOT a mode; it's a settings preset applied by Host UI.
};
```

Each mode module exports this interface:

```js
module.exports = {
  id: 'story',                  // matches the key above
  displayName: 'Story',
  description: 'Text-only chain. Write the next sentence based only on the previous.',
  revealLayout: 'scrollback',   // 'stepper' | 'frame-cycle' | 'gallery' | 'scrollback'
  supportsManualAdvance: false, // true for masterpiece
  // If a mode needs special validation before game:start, this returns a string error or null.
  validateStart(room) { return room.players.length >= 2 ? null : 'Need 2+ players'; },
  // First phase to enter when game starts.
  initialPhase(room) { return { name: 'write', round: 0, seconds: room.settings.writeSeconds }; },
  // Given current phase, return next phase descriptor OR null = go to reveal.
  nextPhase(room, current) { /* ... */ },
  // Build albums Array<Array<Slide>>. Reads room._roundData and any mode-specific room state.
  buildAlbums(room) { /* ... */ },
  // Compute per-player prevSlide and prevImage (optional) for phase:assignment.
  // Returns { prevSlide, prevImage?, eraseRect? } per player.
  // Receives playerIndex within the seat ordering (use seatOrder if present, else room.players order).
  assignmentForPlayer(room, playerIdx, phase) { /* ... */ },
  // Optional: called after a successful phase:submit. Mode can mutate room state.
  // Used by missingpiece to track erase rects.
  postSubmit(room, player, slide) { /* optional */ },
};
```

Sea-of-knowledge helper functions can live in `server/modes/_shared.js`.

---

## 3. New Phase Names

Existing: `write`, `draw`, `describe`, `knockoff-show`, `knockoff-draw`.

New:
- `continue` — text continuation (Story)
- `coop-draw` — draw with prev drawing as canvas init (Co-Op)
- `masterpiece-draw` — single drawing, no auto-timeout (Masterpiece)
- `missingpiece-draw` — draw with prev drawing minus a rect (Missing Piece)
- `background-draw` — draw with shared background as canvas init (Background)

For animation, REUSE existing `draw` phase. The mode handles framing logic in album construction.

For secret, REUSE existing `write`/`draw`/`describe`. The mode handles seat ordering.

---

## 4. `phase:assignment` Event — Extended Payload

```js
{
  phase: 'write'|'draw'|'describe'|'continue'|'coop-draw'|'masterpiece-draw'|'missingpiece-draw'|'background-draw'|'knockoff-show'|'knockoff-draw',
  round: 1,
  prevSlide: { type: 'text'|'drawing', content: '...' } | null,
  prevImage: '<jpeg data uri>' | null,   // NEW. When present, client pre-loads canvas with this.
  eraseRect: { x, y, w, h } | null,      // NEW. Missing Piece: client erases this rect from prevImage before showing.
  deadline: 1700000000000 | null,        // null = no auto-advance (Masterpiece)
  meta: { ... } | null,                   // NEW. Optional mode-specific extras (e.g., for Animation: { frameNumber, totalFrames, animationPrompt }).
}
```

Validation:
- Coordinates in `eraseRect` are in canvas internal-resolution coordinates (720x540). Floats OK.
- `prevImage` is a JPEG data URI, same format as a drawing submission.
- `deadline: null` means no auto-submit; client renders an indefinite countdown placeholder and waits for the host to skip OR the player to submit manually.

---

## 5. New Client → Server Events

### `room:seatorder` (host only)
```js
{ order: ['p_abc', 'p_def', 'p_ghi'] }  // playerId[] in desired seat order
```
Only valid in `lobby` state. Server validates every player exists. No ACK; server broadcasts `room:state` on success.

### `room:masterprompt` (host only)
```js
{ prompt: 'The new mascot for Cinema 4D' }
```
Only valid in `lobby` state. Max 300 chars. Used by Masterpiece and Background modes.

### `room:background` (host only)
```js
{ backgroundId: 'grid-light' }  // matches an id from /api/backgrounds
```
Only valid in `lobby` state. Server validates the id exists.

---

## 6. New REST Endpoints

### `GET /api/backgrounds`
Returns the stock backgrounds catalogue.
```js
{
  backgrounds: [
    { id: 'blank-white',    name: 'Blank White',    dataUri: '...' },
    { id: 'blank-black',    name: 'Blank Black',    dataUri: '...' },
    { id: 'grid-light',     name: 'Grid (Light)',   dataUri: '...' },
    { id: 'grid-dots',      name: 'Dot Grid',       dataUri: '...' },
    { id: 'zoom-grid',      name: 'Zoom Grid Mockup', dataUri: '...' },
    { id: 'color-bars',     name: 'TV Color Bars',  dataUri: '...' },
    { id: 'spotlight',      name: 'Spotlight',      dataUri: '...' },
    { id: 'film-frame',     name: 'Film Frame',     dataUri: '...' },
  ]
}
```
Backgrounds are PNG data URIs sized 720x540 to match canvas internal resolution.

### `GET /api/modes`
Returns the registered modes for the host UI to render. (Optional — host UI can hardcode the same list.)

---

## 7. `room:state` Additions

```js
{
  // ... all existing v1 fields ...
  seatOrder: ['p_abc', 'p_def'] | null,    // NEW. Only populated for Secret mode; null otherwise.
  masterprompt: '...' | null,              // NEW. Masterpiece/Background.
  backgroundId: 'grid-light' | null,       // NEW. Background mode.
  revealLayout: 'stepper'|'frame-cycle'|'gallery'|'scrollback' | null, // NEW. Populated when state='reveal' or 'ended'.
}
```

---

## 8. Reveal Behavior by Layout

### `stepper` (Classic, Knock-Off, Co-Op, Missing Piece, Secret)
Server uses existing v1 behavior:
- On enter reveal: `revealCursor = {albumIdx:0, slideIdx:0}`, emit `reveal:slide`
- `reveal:next` / `reveal:prev` step slide-by-slide

### `frame-cycle` (Animation)
- On enter reveal: `revealCursor = {albumIdx:0, slideIdx:0}` (slideIdx unused)
- Server emits a NEW event `reveal:album` with the FULL album:
```js
{
  albumIdx: 0,
  album: [Slide, Slide, ...],
  authors: [{ id, name, emoji, color }, ...],  // index-aligned with album
  total: { albums: 6 },
  animationPrompt: '...',  // from the round-0 write
  fps: 3,
}
```
- `reveal:next` advances `albumIdx` and re-emits `reveal:album`. `reveal:prev` reverses.
- Client cycles frames locally at 3fps. No `reveal:slide` is emitted in this layout.

### `gallery` (Solo, Masterpiece, Background)
- On enter reveal: server emits `reveal:album` with the album of all drawings + authors
- Single album (no album navigation). `reveal:next`/`prev` are no-ops in this layout (but server still accepts them gracefully).
- Client renders all slides as a responsive grid.

### `scrollback` (Story)
- On enter reveal: server emits `reveal:album` per album as the host advances
- First album auto-emitted. `reveal:next`/`prev` advance album-by-album.
- Client renders the full album as a vertical column of text slides.

**Important:** `reveal:album` is a NEW event. `reveal:slide` is preserved for stepper mode only. Clients should listen to BOTH and route to the correct layout based on `room:state.revealLayout`.

---

## 9. Mode-Specific Spec

### Story
- Phases: `write` (round 0) → `continue` (rounds 1..N-1)
- `prevSlide` for continue: the SINGLE previous text slide for this player's album-position (the previous round's slide they're chaining from)
- Album: N slides per album, all type=text
- N albums (one per starting prompt)
- revealLayout: `scrollback`

### Animation
- Phases: `write` (round 0, "describe your animation") → `draw` (rounds 1..N-1, each frame)
- `prevSlide` for draw: the PREVIOUS frame's drawing (a Slide of type='drawing')
- Optionally include the round-0 write text in `assignment.meta.animationPrompt`
- Album: N slides per album. Slide 0 = text prompt, slides 1..N-1 = drawing frames.
- N albums
- revealLayout: `frame-cycle`. Frames in cycle = slides[1..N-1] (slide 0 shown as subtitle).

### Co-Op
- Phases: same as Classic (write → draw → describe → draw → describe → ...)
- For draw phases: `prevImage` = the previous DRAWING slide's content (most recent drawing in this chain). For the first draw, prevImage = null (or the prev slide is text, so no image).
- For describe phases: same as Classic (`prevSlide` is the drawing)
- Album: same as Classic
- revealLayout: `stepper`

### Masterpiece
- Phases: single `masterpiece-draw` (round 1)
- `prevSlide`: { type: 'text', content: room.masterprompt || fallback }
- `deadline`: null (no timer)
- Server starts the timer but with a 15-minute hard cap as backstop
- `supportsManualAdvance: true` — host can `phase:skip` at any time
- Album: 1 album, N slides (one per player), each a drawing
- revealLayout: `gallery`

### Missing Piece
- Phases: `write` (round 0) → `missingpiece-draw` (rounds 1..N-1)
- For round 1 (first draw): `prevSlide` = the write text. `prevImage` = null. No erase.
- For rounds 2..N-1: `prevSlide` = previous draw slide. `prevImage` = previous draw's content. `eraseRect` = { x, y, w, h } picked by server via seeded RNG (seed = room.code + round + albumIdx).
- Client receives prevImage, applies eraseRect (white-fills it), uses that as canvas init, player draws on top, submits.
- Album: N slides per album (slide 0 = text, slides 1..N-1 = drawings)
- N albums
- revealLayout: `stepper`

### Background
- Phases: single `background-draw` (round 1)
- `prevSlide`: { type: 'text', content: room.masterprompt || '' } — optional text prompt
- `prevImage`: the chosen background's dataUri
- Album: 1 album, N slides (one per player drawing on top of the background)
- revealLayout: `gallery`

### Secret
- Phases: same as Classic
- Seat ordering: `room.seatOrder` if set, else `room.players.map(p => p.id)`
- All `(j + i) mod N` calculations use seat ordering for player lookup
- Album construction same as Classic but using seat order
- revealLayout: `stepper`

### Speedrun
- NOT a mode in the registry
- Host UI provides a "Speedrun Preset" button that, when clicked:
  - Sets `writeSeconds = 15`, `drawSeconds = 30`, `describeSeconds = 15`
  - Sets `knockoffShowSeconds = 4`
  - Emits `room:settings` with these values
- Host then picks any actual mode and starts the game

---

## 10. Erase-Rect Algorithm (Missing Piece)

Server picks the rect:
```js
// In modes/missingpiece.js
const seed = hashString(room.code + ':' + round + ':' + albumIdx);
const rng = seededRandom(seed);
const W = 720, H = 540;
const rectW = Math.floor(W * 0.25);   // 25% of width
const rectH = Math.floor(H * 0.25);   // 25% of height
const x = Math.floor(rng() * (W - rectW));
const y = Math.floor(rng() * (H - rectH));
return { x, y, w: rectW, h: rectH };
```

Use a simple seeded RNG (xmur3 + sfc32 from one-liner code is fine, ~10 lines). Don't pull a library.

Client applies the rect by filling it with white (`fillStyle = '#ffffff'`) on the canvas after loading prevImage.

---

## 11. DOM Element IDs Added by Agent E

If Agent E adds new HTML, IDs follow `#m-*`:

Inside `#settings-panel`:
- `#m-knockoff-show` — number input for knockoffShowSeconds (visible when mode=knockoff)
- `#m-master-prompt` — text input for room.masterprompt (visible when mode=masterpiece or background)
- `#m-bg-picker` — container for thumbnail buttons (visible when mode=background)
- `#m-secret-order` — container for reorderable player list (visible when mode=secret)
- `#m-speedrun-btn` — preset button (always visible)
- `#m-mode-description` — paragraph showing the description of the currently-selected mode (always visible)

Inside `#phase-status`:
- `#m-end-phase-btn` — visible during masterpiece-draw phase, calls phase:skip

Inside `#reveal-panel`:
- `#m-reveal-stepper` — container, used by stepper layout (default; can wrap existing #reveal-image etc.)
- `#m-reveal-cycle` — container for frame-cycle layout (Animation)
- `#m-reveal-gallery` — container for gallery layout (Solo/Masterpiece/Background)
- `#m-reveal-scrollback` — container for scrollback layout (Story)

Existing `#reveal-image`, `#reveal-text`, `#reveal-author`, `#reveal-position`, `#reveal-next`, `#reveal-prev` STAY as the stepper layout's elements. Agent D shows/hides the four `#m-reveal-*` containers based on `revealLayout`.

---

## 12. Player Index in Secret Mode

When a mode (e.g., classic, story, animation, coop, missingpiece, secret) computes which player gets which slide, use this helper:

```js
function getSeatOrder(room) {
  if (room.seatOrder && room.seatOrder.length === room.players.length) {
    return room.seatOrder.map(id => room.players.find(p => p.id === id)).filter(Boolean);
  }
  return room.players;
}
```

All `(j + i) mod N` calculations operate on `getSeatOrder(room)`.

---

## 13. Validation Cap Additions

| Field | Cap |
|---|---|
| `masterprompt` | 300 chars |
| `seatOrder` | exact length = room.players.length, every ID present once |
| `backgroundId` | must match an id in `server/backgrounds.js` |
| Animation framerate | fixed at 3fps on client (do NOT make configurable in v1.1) |
| Masterpiece hard cap | 15 minutes max (server enforces) |

---

## 14. Backward Compatibility

- v1 clients connecting to v1.1 server: still work. They will not know about new modes (host UI just shows the old 3) and `revealLayout` will be `'stepper'` for classic/knockoff/solo, which is what they expect.
- v1.1 clients connecting to a v1 server: gracefully degrade. New events the server doesn't understand are silently dropped server-side (Agent A: make sure unknown event handlers don't crash).

---

## 15. Smoke Tester Specification (Agent H)

`tests/smoke.js` is a standalone Node script:

```bash
node tests/smoke.js
# or
npm test
```

It:
1. Starts the server in a child process (or expects it to be running on localhost:3000 — go with "expects running")
2. Connects 3 socket.io-client instances as fake players
3. For each mode in `['classic','knockoff','solo','story','animation','coop','masterpiece','missingpiece','background','secret']`:
   - Creates a room
   - Joins 2 more players
   - For masterpiece/background, also sets `room:masterprompt`. For background also sets `room:background`. For secret, calls `room:seatorder`.
   - Calls `game:start`
   - For each `phase:assignment` received, submits a valid response (random text or a tiny 1x1 JPEG data URI)
   - Skips through phase:skip if a phase has no deadline
   - Waits for state=reveal
   - Asserts: revealLayout matches expected, albums exist, all players have submitted at least once
   - Triggers reveal:next a few times to make sure it doesn't crash
4. Prints `PASS: classic` or `FAIL: classic — reason` per mode
5. Exits with code 0 if all pass, 1 if any fail
6. Uses `socket.io-client` (add to devDependencies)

The tester does NOT validate UI rendering. It validates the state machine and event contracts.

Note: a "tiny valid JPEG" is the easiest way to satisfy the drawing-submit validator (`data:image/jpeg;base64,/9j/...`). The tester ships a hardcoded 32x32 minimal JPEG.

---

## 16. Tech Notes for All Agents (v1.1)

- Server still CommonJS, Node 20.
- Frontend still vanilla ES modules.
- All file paths absolute and use forward slashes in JS (`'./modes/classic'`).
- No new npm dependencies in package.json EXCEPT `socket.io-client` to devDependencies (Agent H).
- Backgrounds in `server/backgrounds.js` should be inline SVG → encodeURIComponent → `data:image/svg+xml;utf8,...` for compactness, OR converted to 720x540 PNG using a one-shot online tool and pasted in. Either is acceptable. Aim for <50KB each.

If anything in this contract feels wrong while you're building, **stop and report**. Do not silently diverge.
