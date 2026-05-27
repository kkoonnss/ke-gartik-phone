# v2 Agent A — Mode Engine (Server)

## Your scope
Refactor `server/game.js` into a thin dispatcher + shared helpers. Move classic/knockoff/solo logic into mode strategy modules. Write all eight new mode strategies. Update `server/rooms.js` to include the new fields in `serializeRoom`.

## Files you own (edit/write ONLY these)
- `server/game.js` (refactor — keep public API `attachGame(io)` identical)
- `server/rooms.js` (extend `serializeRoom` to include `seatOrder`, `masterprompt`, `backgroundId`, `revealLayout`)
- `server/modes/index.js` (new)
- `server/modes/_shared.js` (new — shared helpers like `getSeatOrder`, `seededRandom`, `pickEraseRect`)
- `server/modes/classic.js` (new — extracted from current game.js)
- `server/modes/knockoff.js` (new — extracted)
- `server/modes/solo.js` (new — extracted AND fix the wasted-write-phase bug; solo starts at draw)
- `server/modes/story.js` (new)
- `server/modes/animation.js` (new)
- `server/modes/coop.js` (new)
- `server/modes/masterpiece.js` (new)
- `server/modes/missingpiece.js` (new)
- `server/modes/background.js` (new)
- `server/modes/secret.js` (new)
- `server/imageutils.js` (new — not currently needed by anyone server-side since erase is client-side, but reserved for future. Can be empty stub.)
- `server/index.js` — you may add `GET /api/backgrounds` and `GET /api/modes` if not already present (check first; if not present, Agent G or A handles backgrounds endpoint — coordinate via brief: Agent A owns adding these routes to index.js)

Wait — `server/index.js` is in Agent A scope for this addition. You add the routes. Backgrounds data lives in `server/backgrounds.js` which Agent G writes. You `require('./backgrounds')` and serve it.

## Required reading
- `_Briefs/CONTRACT_v2.md` — locked event shapes, mode interface, phase names, reveal layouts
- `_Briefs/ke-gartik-phone-v1.1-scope.md` — overall sprint context
- `_Briefs/CONTRACT.md` — v1 contract (still authoritative for shapes NOT modified by v2)
- Current `server/game.js`, `server/rooms.js`, `server/index.js` — understand what you're refactoring

## Mode Interface (locked, see CONTRACT_v2 §2)

```js
module.exports = {
  id: 'story',
  displayName: 'Story',
  description: '...',
  revealLayout: 'scrollback',
  supportsManualAdvance: false,
  validateStart(room) { return room.players.length >= 2 ? null : 'Need 2+ players'; },
  initialPhase(room) { return { name, round, seconds }; },
  nextPhase(room, current) { return { name, round, seconds } | null; },
  buildAlbums(room) { return Album[]; },
  assignmentForPlayer(room, playerIdx, phase) {
    // Returns { prevSlide, prevImage?, eraseRect?, meta? }
  },
  postSubmit(room, player, slide) { /* optional */ },
};
```

`assignmentForPlayer` receives the player's INDEX in seat order (use `getSeatOrder(room)` from `_shared`).

## Refactor steps

1. **Move classic/knockoff/solo phase advancement** out of `game.js` into the three module files. The original `nextPhaseName` switch becomes `nextPhase` in each module. The original `emitAssignments` loop body for each phase becomes `assignmentForPlayer` per module.

2. **`game.js` keeps**: socket event wiring, timer loop, broadcast/error helpers, disconnect handling, phase:submit validation, advance orchestration. It DELEGATES `initialPhase`, `nextPhase`, `assignmentForPlayer`, `buildAlbums`, `postSubmit` to the loaded mode.

3. **Add `revealLayout` to room state** when entering reveal. Read `mode.revealLayout` and store on `room.revealLayout`.

4. **Add `reveal:album` emission** when entering reveal for layouts other than `stepper`. For `stepper`, keep existing `reveal:slide` behavior. For `frame-cycle`, `gallery`, `scrollback`, emit `reveal:album` with the current album. On `reveal:next`/`reveal:prev`, the behavior depends on layout:
   - `stepper`: step slide-by-slide (current behavior)
   - `frame-cycle`, `scrollback`: step album-by-album, re-emit `reveal:album`
   - `gallery`: ignore next/prev (or accept silently)

5. **Add `reveal:album` payload** (see CONTRACT §8):
```js
{
  albumIdx,
  album: Slide[],
  authors: [{ id, name, emoji, color }],   // index-aligned with album
  total: { albums: N },
  animationPrompt: '...',  // for Animation: round-0 write text
  fps: 3,                  // for Animation only
}
```

6. **Handle new client events:**
   - `room:seatorder` — host only, lobby only. Validates every player ID exists. Stores `room.seatOrder = order`. Broadcasts state.
   - `room:masterprompt` — host only, lobby only. Validates length ≤300. Stores `room.masterprompt`. Broadcasts state.
   - `room:background` — host only, lobby only. Validates ID exists (require `./backgrounds`). Stores `room.backgroundId`. Broadcasts state.

7. **Add REST routes** in `server/index.js`:
   - `GET /api/backgrounds` → reads from `require('./backgrounds').BACKGROUNDS` and returns `{ backgrounds: [...] }`
   - `GET /api/modes` → returns list of mode metadata (id, displayName, description, revealLayout)

8. **Handle `phase:assignment` with new fields**: when calling `mode.assignmentForPlayer`, if it returns `prevImage` and/or `eraseRect`, include them in the emitted assignment payload. Always include all fields (null if N/A) so client parsing is uniform.

9. **Masterpiece manual-advance**: if `mode.supportsManualAdvance` is true, the timer loop should NOT auto-advance based on `endsAt`. The timer still emits `phase:tick` (so client shows elapsed time) but only host's `phase:skip` advances the phase. Set a 15-minute hard cap as a safety net: if elapsed > 15min, force advance.

10. **Solo fix**: `solo.js` initialPhase returns `{name:'draw', round:1, seconds: room.settings.drawSeconds}`. No write phase. `buildAlbums` builds the 1-album N-drawing album with `_soloPrompt` slide 0.

## Per-mode specs (full detail in CONTRACT_v2 §9)

Implement each mode strictly per the spec. Key reminders:

- **Story**: write(0) → continue(1..N-1). Albums same length as Classic, all text. revealLayout: scrollback.
- **Animation**: write(0) → draw(1..N-1). Frames are drawings. revealLayout: frame-cycle. Include animationPrompt and fps in reveal:album.
- **Co-Op**: Classic phases. Draw phases include `prevImage` = previous drawing's content. revealLayout: stepper.
- **Masterpiece**: single masterpiece-draw(1), deadline:null, supportsManualAdvance:true. 1 album, N slides. revealLayout: gallery. Uses room.masterprompt.
- **Missing Piece**: write(0) → missingpiece-draw(1..N-1). Round 1 has no prevImage. Rounds 2+ have prevImage = previous draw, eraseRect = seeded random. revealLayout: stepper.
- **Background**: single background-draw(1), prevImage = chosen background dataUri. 1 album, N slides. revealLayout: gallery. Uses room.masterprompt + room.backgroundId.
- **Secret**: Classic phases, but seat ordering uses room.seatOrder. revealLayout: stepper.

## Shared helpers in `_shared.js`

```js
function getSeatOrder(room) {
  if (room.seatOrder && room.seatOrder.length === room.players.length) {
    return room.seatOrder.map(id => room.players.find(p => p.id === id)).filter(Boolean);
  }
  return room.players;
}

function hashString(s) { /* xmur3 */ }
function seededRandom(seed) { /* sfc32 from seed */ }
function pickEraseRect(roomCode, round, albumIdx, W=720, H=540) {
  const seed = hashString(`${roomCode}:${round}:${albumIdx}`);
  const rng = seededRandom(seed);
  const rectW = Math.floor(W * 0.25);
  const rectH = Math.floor(H * 0.25);
  const x = Math.floor(rng() * (W - rectW));
  const y = Math.floor(rng() * (H - rectH));
  return { x, y, w: rectW, h: rectH };
}

function emptyText() { return '...'; }
function emptyDrawing() { return ''; }   // empty content, type='drawing'
```

## Definition of done

- All 11 modes are registered and load via `require('./modes')`
- Classic, Knockoff, Solo still produce identical behavior to v1 (smoke-test parity)
- Each new mode advances through all phases and reaches reveal without crashing
- `room:state` includes all four new fields
- `reveal:album` is emitted with correct payload for non-stepper layouts
- Three new client events (`room:seatorder`, `room:masterprompt`, `room:background`) are handled
- Two new REST routes are present
- File ownership respected

## Report when done

Write `_Briefs/v2-agent-A-done.md` with:
- Files created / refactored
- Mode-by-mode summary of behavior
- Any contract changes you wanted but didn't make
- How to manually test each mode end-to-end
