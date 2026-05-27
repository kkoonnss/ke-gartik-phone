# KE_GartiK_Phone v1.1 — Game Modes Expansion

This document scopes the second sprint: eight new game modes plus v1.0 polish. Architecturally, the goal is to refactor the single-purpose state machine in `server/game.js` into a mode-dispatch system so each mode is a pluggable strategy. That refactor unlocks all future modes (Discord OAuth, custom decks, etc.) without re-touching the dispatcher.

---

## 1. Project Overview

Monday Meeting's monthly game night currently has three modes (Classic, Knock-Off, Solo). v1.1 brings the lineup to **eleven modes** by adding the remaining Gartic Phone variants the user asked for, plus light v1.0 cleanup.

Success looks like: every mode picked from the dropdown plays through without crashes, the reveal layout is appropriate for that mode's output (animation cycles, masterpiece gallery, story scrollback, etc.), and the smoke-test script Agent H produces returns green for all eleven modes before deploy.

This is a sprint without a live test partner. Architectural discipline (locked contract, disjoint file ownership, an automated smoke test) substitutes for manual QA.

---

## 2. User Roles and Permissions

Unchanged from v1.0: Host (creates room, sets mode, advances reveal), Player (joins, submits), Spectator (read-only album page).

**New host-only capabilities in v1.1:**
- Reorder players (Secret mode pass order)
- Provide a master prompt (Masterpiece, Background)
- Pick a stock background (Background mode)
- Manually end a no-timer phase (Masterpiece)
- One-click Speedrun preset (sets all timers to short values)

---

## 3. Feature Map

### v1.1 must-have (this sprint)

| Feature | Mode(s) | Priority |
|---|---|---|
| Mode-dispatch refactor in server/game.js | all | critical |
| Story mode (text-only chain) | Story | must |
| Animation mode (frame chain → reveal as looping frame strip) | Animation | must |
| Co-Op mode (each draw starts from previous drawing) | Co-Op | must |
| Masterpiece mode (single no-timer drawing per player to a shared prompt) | Masterpiece | must |
| Missing Piece mode (drawing passes; server erases a rect each round; next player fills) | Missing Piece | must |
| Background mode (shared background, players overdraw, side-by-side reveal) | Background | must |
| Secret mode (host-controlled pass order via drag-to-reorder) | Secret | must |
| Speedrun preset button | preset | must |
| Canvas accepts an initial image (Co-Op, Missing Piece, Background) | all draw modes | must |
| Reveal frame-cycler for Animation | Animation | must |
| Reveal side-by-side gallery for Solo / Masterpiece / Background | 3 modes | must |
| Reveal story-scrollback view for Story | Story | must |
| Smoke-test harness for all 11 modes | all | must |

### v1.0 polish folded into this sprint

- **Solo skip-write fix**: Solo mode currently runs a wasted `write` phase. Refactor: solo starts directly at `draw` with the system prompt.
- **knockoffShowSeconds in host UI**: expose the input.
- **Standalone /album/:code refresh**: page should fetch room state on load (not just rely on the join ACK) so a refresh recovers the full album.
- **Auto-host promotion banner**: small UI nudge when promotion happens.
- **Disconnect indicator polish**: greyed-out player chips are working but could show "reconnecting…" on host page.

### Future (v2)

- Persistent past albums (database)
- Discord OAuth
- Custom prompt deck upload
- Voting on funniest album
- Multi-room support (separate URL per night)
- Spectator-only link

---

## 4. Page/Screen Map (delta from v1.0)

| Route | New behavior |
|-------|---|
| `/host/:code` | Mode dropdown gains 8 new options. Conditional sub-panels appear per mode: Secret = reorderable player list; Masterpiece/Background = prompt input; Background = stock-background picker; speedrun preset button always visible. |
| `/play/:code` | New phase screens: `continue` (write with prev sentence shown); `coop-draw` (canvas pre-loaded with prev drawing); `missing-piece-draw` (canvas pre-loaded with erased portion + ghosted erased outline); `background-draw` (canvas pre-loaded with bg image); `masterpiece-draw` (canvas, no timer, manual submit only); animation frames use the existing `draw-screen` with a frame-counter banner. |
| Reveal (host page + album page) | Layout switches per mode: classic/knockoff = single-slide stepper (current); animation = auto-cycling frame loop; solo/masterpiece/background = grid gallery; story = scrolling timeline. |

---

## 5. Technical Architecture

### Stack
No changes. Node 20 + Express + Socket.io + qrcode + nanoid. Vanilla frontend.

### Mode-dispatch refactor (the centerpiece)

`server/game.js` keeps the socket-event wiring and shared helpers. All mode-specific logic moves into `server/modes/`:

```
server/
  index.js
  rooms.js
  game.js          ← thin dispatcher + shared helpers (timer, submit validation, disconnect)
  prompts.js
  modes/
    index.js       ← registry: { classic, knockoff, solo, story, animation, coop, masterpiece, missingpiece, background, secret, speedrun }
    classic.js
    knockoff.js
    solo.js
    story.js       ← NEW
    animation.js   ← NEW
    coop.js        ← NEW
    masterpiece.js ← NEW
    missingpiece.js← NEW
    background.js  ← NEW
    secret.js      ← NEW (mostly thin wrapper over classic with custom seat ordering)
    speedrun.js    ← NEW (thin wrapper that overrides timer settings on game:start)
  imageutils.js    ← NEW: erase-rect helper for Missing Piece
  backgrounds.js   ← NEW: list of stock backgrounds with id/name/dataUri
```

Each mode module exports:

```js
{
  id: 'story',
  displayName: 'Story',
  description: '...',
  initialPhase(room) → { name, round, seconds, durationOverride?, allowManualAdvance? },
  nextPhase(room, currentPhase) → next phase descriptor or null (= reveal),
  buildAlbums(room) → Album[],          // Album = Slide[] (flat array per v1 CONTRACT)
  prevSlideForPlayer(room, pIdx, phase) → { type, content } | null,
  postSubmitHook?(room, player, slide), // optional, for missing-piece to do erasing
  revealLayout: 'stepper' | 'frame-cycle' | 'gallery' | 'scrollback', // hint sent to clients
  supportsManualAdvance?: boolean,      // for masterpiece
  requiresSettings?: { backgroundId?, masterprompt?, secretOrder? },  // declares config required
}
```

The dispatcher in `game.js`:
- On `game:start`, loads `modes[room.settings.mode]`, calls `initialPhase`, starts the timer
- On phase end, calls `nextPhase`. If null, goes to reveal, calls `buildAlbums`
- On `phase:submit`, calls optional `postSubmitHook` after recording
- Emits `reveal:layout` once on state=reveal so clients know which layout to use

### Per-mode mechanics (detailed)

#### Story
- All text. No drawing.
- N players → N rounds total (write + N-1 continues), so each album has N slides
- Phase names: `write` (round 0) → `continue` (rounds 1..N-1) → reveal
- `prevSlide` for continue: the previous slide's text (player only sees the last sentence)
- Reveal layout: `scrollback` — show the album as a vertical column of sentences, all visible

#### Animation
- Each player adds one drawing-frame to an animation chain
- Phase names: `write` (round 0, "describe your animation") → `draw` (rounds 1..N-1, each frame builds on the previous frame as a visual reference)
- The album becomes N frames; reveal cycles them at ~3 fps in a loop per album
- `prevSlide` for draw: the previous frame (so player can match style/composition)
- Optionally, also show the original write prompt in a subtitle line
- Reveal layout: `frame-cycle`

#### Co-Op
- Same as Classic phases (write → draw → describe → ...) **except** every draw phase gives the player a canvas pre-loaded with the previous drawing
- The player's submission is the cumulative state (draw on top, don't erase)
- Album construction same as Classic
- New `phase:assignment.prevImage` field added when applicable (see CONTRACT_v2)
- Reveal layout: `stepper` (same as classic)

#### Masterpiece
- Single phase: `masterpiece-draw` (rounds=1, no timer auto-advance)
- Host provides a master prompt at game-start time (or random fallback from prompts.js)
- Each player draws their take. No chain.
- Phase has no deadline (or a very high one, like 30 minutes). Player submits when done.
- Host UI gains "End Phase" button — calls `phase:skip`
- Reveal layout: `gallery` (all drawings side-by-side, each with author chip)

#### Missing Piece
- Same as Classic-but-no-describe: write → draw → draw → ... (all drawings, no describe phases)
- After each draw phase, server erases a random ~20% rectangle from EACH drawing in the chain (one rect per drawing)
- Next player receives the erased version as their canvas init
- Server stores the erased version (so the album shows progressive erasure as the artistic effect)
- Phase names: `write` (round 0), `missingpiece-draw` (rounds 1..N-1)
- Reveal layout: `stepper`

#### Background
- All players draw simultaneously on the same shared background image (single phase)
- Host picks a background ID at game-start (or none = blank)
- One phase: `background-draw` (round 1)
- No chain
- Reveal layout: `gallery`

#### Secret
- Identical to Classic in phases
- Difference: host drags player order in the lobby; that order is the chain order
- Server stores `room.seatOrder: playerId[]` and uses it instead of `room.players` order for `(j + i) mod N` calculations
- Host UI: drag-to-reorder list (mouse + touch via pointer events)
- Reveal layout: `stepper`

#### Speedrun
- Not a separate mode; a SETTINGS PRESET
- Host clicks "Speedrun" button → sets writeSeconds=15, drawSeconds=30, describeSeconds=15
- Then host picks any mode and plays — these short timers apply
- Mode stays Classic by default
- Implementation: a button in host UI that updates settings inputs + emits `room:settings`

### Image-init protocol (Co-Op, Missing Piece, Background)

The `phase:assignment` event gains an optional `prevImage` field when the player should start drawing on top of an existing image. Distinct from `prevSlide.content`:
- `prevSlide` is what the player should reference visually (e.g., a description above the canvas)
- `prevImage` is the raster they should literally start drawing on top of

Canvas accepts a `loadImage(dataUri)` method that wipes the undo stack and paints the image as the starting state.

### Reveal layouts

The server, on entering `reveal` state, broadcasts a `room:state` whose `revealLayout` field tells clients which layout to render. Layouts:

- `stepper`: current v1 behavior. Host steps slide-by-slide.
- `frame-cycle`: host advances ALBUM-by-album (not slide-by-slide); within an album, frames auto-cycle at ~3fps. Host pauses/plays.
- `gallery`: all slides of all albums shown as a responsive grid. Host clicks one to expand. No stepping needed.
- `scrollback`: vertical text column showing the whole album at once. Host advances album-by-album.

Clients implement all four; server just picks which to use.

### Backgrounds library

`server/backgrounds.js` exports an array of stock backgrounds. Initial set (~8 motion-design-flavored, motion-meeting-friendly):
- Empty white
- Empty black
- Grid (light)
- Dot grid
- Conference Zoom-grid mockup
- TV color bars
- Spotlight (dark with center glow)
- Frame outline (looks like a film frame)

Each is a simple SVG converted to data URI at build time, ~5-30KB each, total payload manageable.

### Solo mode fix
Solo no longer enters a write phase. `initialPhase` for solo returns `{ name: 'draw', round: 1, seconds: drawSeconds }`. Players see the system prompt as their prevSlide.text. Album construction unchanged.

---

## 6. Data Model (delta)

```js
Room {
  // existing fields, plus:
  seatOrder: string[] | null,  // playerId[] for Secret mode; null = use players array order
  masterprompt: string | null, // Masterpiece/Background prompt
  backgroundId: string | null, // Background mode
  revealLayout: 'stepper' | 'frame-cycle' | 'gallery' | 'scrollback' | null,
}

Settings {
  // existing, plus:
  knockoffShowSeconds: number,  // now exposed in UI
  // No new fields for masterpiece/background; their config lives at room level above
}

Slide {
  // existing, plus:
  erasedRect?: { x, y, w, h } | null,  // Missing Piece: rect that was erased FROM this slide
}
```

---

## 7. Socket.io Contract additions

See `CONTRACT_v2.md` for the canonical spec. Highlights:

- New phase names: `continue`, `coop-draw`, `masterpiece-draw`, `missingpiece-draw`, `background-draw`
- `phase:assignment` gains optional `prevImage` (dataUri)
- New event `room:seatorder` (host → server) for Secret mode
- New event `room:masterprompt` (host → server) for Masterpiece/Background
- New event `room:background` (host → server) for Background mode (picks an ID)
- `room:state` gains `revealLayout`, `seatOrder`, `masterprompt`, `backgroundId`
- Animation reveal: instead of `reveal:slide` per slide, server emits `reveal:album` with the full album so client can cycle locally

---

## 8. Third-Party / Library Changes

None. No new npm packages. All image manipulation done via the existing `canvas` package would be overkill — Missing Piece's erase-rect is done by parsing the JPEG data URI, drawing to an offscreen `node-canvas` instance, erasing, and re-encoding. **Avoid this dependency**: instead, send the erase-rect coords to the client as part of `phase:assignment.eraseRect` and let the receiving client do the erasing on canvas (zero server-side image processing).

---

## 9. Risk Register

| Risk | Why it matters | Mitigation |
|---|---|---|
| **Mode-dispatch refactor regresses Classic** | Most-used mode breaks during refactor | Smoke tester (Agent H) runs Classic first. Refactor preserves Classic's exact behavior; Agent A does an offline review of his own classic.js output against the original `nextPhaseName` switch. |
| **Image-init payload size** | Co-Op + Missing Piece push the WS message size up (sending 200KB image + drawing every round) | Already capped at 250KB per submission. Adding a "starting image" pushes assignment payloads to ~250KB too. Tolerable; total session bandwidth is fine for 16 players. |
| **Erase-rect on client risks divergence** | Each client erases its own version → drift if rects differ | Server picks the rect (using a seeded RNG per room) and ships rect coords. Client just executes. Deterministic. |
| **Animation reveal cycle on mobile** | Phone screens may chug on rapid image swaps if frames are large | Cap at 3fps. Pre-decode all frames before cycling starts. |
| **Secret mode UI complexity** | Drag-to-reorder on mobile is finicky | Drag via pointer events with up/down buttons as accessible fallback. |
| **Masterpiece no-timer abuse** | One slow player blocks the room indefinitely | Host has manual End Phase button. Add a soft 15-minute hard cap as backstop. |
| **Smoke tester false negatives** | Tester says green but real users hit bugs | Tester only checks state transitions, not UI rendering. Document this explicitly in tester output. |
| **Contract drift between v1 and v2** | Existing clients connecting to upgraded server | Backward-compatible: new fields are additive. Old payload shapes still work. |

---

## 10. Open Questions and Future Considerations

### Decisions taken upfront (no need to ask Kons)
- Animation framerate: 3fps loop (slow enough to read each frame, fast enough to feel like animation)
- Masterpiece hard cap: 15 minutes
- Erase-rect size: ~20% of canvas (random position, never overlapping the previous erase if possible)
- Secret mode default order: same as Classic seat order; host edits if desired
- Background palette: 8 stock SVGs to start
- Speedrun timers: 15/30/15 seconds

### Deferred to v2
- Custom prompt deck upload
- Discord OAuth
- Voting on funniest album
- Multi-language support
- Save-album-as-zip

---

## 11. Implementation Phases

This is a single multi-agent sprint.

### Phase 0 (orchestrator, me, before fanning out)
- Write CONTRACT_v2.md (locked event + mode + phase shapes)
- Write 8 agent briefs
- Verify v1.0 contract still parses (no field renames, only additions)

### Phase 1 — Parallel build (8 agents)

| Agent | Owns |
|---|---|
| **A: Mode Engine** | Refactor `server/game.js` into dispatcher + helpers. Write all 11 mode strategy files under `server/modes/`. Update `serializeRoom` in `server/rooms.js` to include new fields. |
| **B: Canvas + Image** | Extend `public/js/canvas.js` with `loadImage(dataUri)`, `applyEraseRect({x,y,w,h})`. Add a `getRectErasedDataUrl(rect)` for the post-submit step. |
| **C: Player UI** | Extend `public/js/play.js` to handle new phase types: `continue`, `coop-draw`, `masterpiece-draw`, `missingpiece-draw`, `background-draw`. Wire `prevImage` + `eraseRect` from assignments. |
| **D: Reveal Player** | Extend `public/js/album.js` with four layouts (stepper, frame-cycle, gallery, scrollback). Read `state.revealLayout`. |
| **E: Host UI** | Extend `public/js/host.js`: new mode options in select; per-mode sub-panel (Secret reorder, Masterpiece/Background prompt input, Background picker, knockoffShowSeconds input, Speedrun preset button, End Phase button for masterpiece). |
| **F: Theming** | Extend `public/css/styles.css` with: continue-screen styles, frame-strip layout, gallery grid, scrollback list, reorder-list, prompt-input, background-picker thumbs. |
| **G: Backgrounds + Prompts** | Write `server/backgrounds.js` with 8 stock backgrounds as inline SVG data URIs. Extend `server/prompts.js` with mode-specific decks (`MASTERPIECE_PROMPTS`, `BACKGROUND_PROMPTS`, `ANIMATION_PROMPTS`). |
| **H: Smoke Tester** | Write `tests/smoke.js` — a Node script using `socket.io-client` to simulate 3 fake players, runs each of the 11 modes start-to-reveal, prints pass/fail per mode. Add `npm test` script. |

### Phase 2 — QC and iterative fixes (orchestrator)
- Read every output file
- Run smoke tester (mentally trace through — sandbox bash is broken, so visual review)
- Spawn focused fix-up Sonnet agents for any contract drift
- Repeat until smoke tester would pass

### Phase 3 — Polish + ship
- Update README mode descriptions
- Version bump package.json → 0.2.0
- Update qc-integration-log.md with new fixes
- Update CONTEXT.md if present

---

**Sprint discipline:** Same as v1.0 — each agent works in disjoint files, reads CONTRACT_v2.md and their own brief, reports completion in `agent-X-v2-done.md`. If they need a contract change, they stop and report.
