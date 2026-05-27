# ARCHITECTURE OVERVIEW — KE_GartiK_Phone v0.2

Produced by the project auditor on 2026-05-26. Descriptive reference only — no code was changed.

---

## 1. What The System Does

KE_GartiK_Phone is a real-time party game for Monday Meeting game nights. Players join a room by scanning a QR code on the host's shared screen. The host drives the round flow from a browser on a laptop or TV; players submit drawings and text prompts from their phones. After all rounds complete the host triggers a slide-by-slide reveal of the "albums" (the telephone chain of prompts and drawings).

The server is stateless from the perspective of infrastructure: there is no database, no session tokens, and no external services. All game state lives in Node.js process memory and is discarded when the server restarts. This is acceptable for a monthly scheduled event.

---

## 2. Version Evolution

### v0.1 (6-agent sprint)
- Three modes: Classic, Knock-Off, Solo
- Single `server/game.js` handling all mode logic via a switch/case state machine
- QC pass fixed: QR response field mismatch, album shape mismatch in album.js, Solo mode `_slideData` vs `_roundData` bug
- Deferred: wasted write phase in Solo, knockoffShowSeconds not exposed in UI

### v0.2 (8-agent sprint, current)
- Ten modes: Classic, Knock-Off, Solo, Story, Animation, Co-Op, Masterpiece, Missing Piece, Background, Secret (plus Speedrun as a settings preset)
- `server/game.js` refactored to a thin dispatcher; all mode logic moved to `server/modes/*.js` strategy files
- Canvas extended: `loadImage`, `applyEraseRect`, `setStartImage`
- Player UI extended: five new phase renderers
- Album reveal extended: four layout types (stepper, frame-cycle, gallery, scrollback)
- Host UI extended: mode-specific sub-panels, Speedrun preset, End Phase button
- Backgrounds catalogue: 8 stock SVG backgrounds
- Prompt decks: four domain-specific decks (PROMPTS, MASTERPIECE_PROMPTS, ANIMATION_PROMPTS, BACKGROUND_PROMPTS)
- Smoke test harness covers all 10 modes
- QC pass fixed: CSS class divergence between album.js and styles.css (primary issue)
- Solo mode bug fixed: now starts directly at `draw` round 1

---

## 3. File Map

```
KE_GartiK_Phone/
  package.json               Node 20 CJS project; deps: express, socket.io, qrcode, nanoid
  render.yaml                Render.com blueprint (free tier, Oregon, auto-deploy from main)
  README.md                  Player/host guide + run-local instructions
  run-local.bat              Windows dev launcher (opens browser, installs deps if missing)
  tests/
    smoke.js                 Node smoke tester; 3 fake socket.io-client players, all 10 modes
  server/
    index.js                 Express app, static serving, REST endpoints (/api/qr, /api/backgrounds, /api/modes, /health), Socket.io bootstrap
    rooms.js                 In-memory room Map, player registry, idle reaper (30min), serializeRoom
    game.js                  Socket event wiring (room:create, room:join, room:settings, room:seatorder, room:masterprompt, room:background, game:start, phase:submit, phase:skip, reveal:next, reveal:prev, disconnect); phase advancement; assignment emission; reveal routing
    prompts.js               Four prompt decks (PROMPTS, MASTERPIECE_PROMPTS, ANIMATION_PROMPTS, BACKGROUND_PROMPTS)
    backgrounds.js           8 stock SVG backgrounds as data URIs (720x540)
    imageutils.js            Stub (reserved for future server-side image ops)
    modes/
      index.js               Mode registry (10 modes keyed by room.settings.mode)
      _shared.js             getSeatOrder, hashString, seededRandom, pickEraseRect, getPrevSlide helpers
      classic.js             Classic mode strategy
      knockoff.js            Knock-Off mode strategy
      solo.js                Solo mode strategy
      story.js               Story mode strategy
      animation.js           Animation mode strategy
      coop.js                Co-Op mode strategy
      masterpiece.js         Masterpiece mode strategy (supportsManualAdvance: true)
      missingpiece.js        Missing Piece mode strategy (uses pickEraseRect)
      background.js          Background mode strategy (uses room.backgroundId)
      secret.js              Secret mode strategy (thin wrapper over Classic with custom seat ordering)
  public/
    index.html               Lobby page (create/join room)
    host.html                Host control panel (QR, player list, settings, phase status, reveal panel)
    play.html                Player game UI (all phase screens share this page)
    album.html               Standalone album viewer (post-game spectator access)
    css/
      theme.css              Design tokens (CSS custom properties), global reset, typography
      styles.css             Component styles for all four pages
    js/
      socket-client.js       Orchestrator-written shared module: socket singleton, emitAck, localStorage helpers, URL helpers
      lobby.js               Lobby page logic: create-room and join-room flows
      host.js                Host page logic: room state display, settings forms, mode sub-panels, Secret reorder, Speedrun preset, End Phase button
      play.js                Player game logic: all 10 phase renderers, auto-submit, countdown, canvas lifecycle
      canvas.js              Drawing canvas module: pointer events, undo stack, brush/color toolbar, getDataUrl, loadImage, applyEraseRect, setStartImage
      album.js               Album reveal logic: dual-mode (host page + standalone album page), four layout renderers
  _Briefs/                   All scope docs, contracts, QC logs, and now audit outputs
```

---

## 4. Request / Socket Flow

### HTTP (stateless routes)

```
Browser GET /            → serve public/index.html
Browser GET /host/:code  → serve public/host.html
Browser GET /play/:code  → serve public/play.html
Browser GET /album/:code → serve public/album.html
Browser GET /api/qr?text=... → server-side QRCode.toDataURL → { dataUrl }
Browser GET /api/backgrounds → require('./backgrounds').BACKGROUNDS
Browser GET /api/modes   → Object.values(modes).map(m => {...})
Browser GET /health      → { ok, rooms, uptimeSec }
```

### Socket.io (stateful game flow)

```
Client CONNECT (ws or polling upgrade)
  |
  ├─ room:create { name, emoji }
  │    ACK { ok, code, playerId, joinUrl }
  │    → createRoom() → socketMap.set() → socket.join(code) → broadcastState()
  |
  ├─ room:join { code, name, emoji, resumePlayerId? }
  │    ACK { ok, playerId, isHost, room? }
  │    → joinRoom() or reconnect existing player → broadcastState()
  |
  ├─ room:settings { mode, writeSeconds, ... }  [host only, lobby only]
  │    → mutate room.settings → broadcastState()
  |
  ├─ room:seatorder { order: [id,...] }          [host only, lobby only, v1.1]
  ├─ room:masterprompt { prompt }                [host only, lobby only, v1.1]
  ├─ room:background { backgroundId }            [host only, lobby only, v1.1]
  |
  ├─ game:start  [host only, lobby only]
  │    → mode.validateStart → mode.initialPhase
  │    → room.state = 'playing'
  │    → broadcastState → emitAssignments → startRoomTimer
  |
  ├─ phase:submit { phase, round, content }
  │    → validate phase/round match, validate content (JPEG or text)
  │    → add to roundData → submitted.add(playerId)
  │    → mode.postSubmit (optional hook, e.g. missingpiece)
  │    → broadcastState → checkAllSubmitted → maybe advancePhase
  |
  ├─ phase:skip  [host only]
  │    → advancePhase immediately
  |
  ├─ reveal:next / reveal:prev  [host only, reveal state]
  │    → advance/retreat revealCursor per layout
  │    → broadcastState + emitRevealSlide or emitRevealAlbum
  |
  └─ disconnect
       → player.connected = false → broadcastState
       → 30s timer → if still disconnected: removePlayer (or promoteNextHost if was host)
```

### Phase Advancement (advancePhase)

```
advancePhase:
  1. clearRoomTimer
  2. Auto-fill missing submissions with blank placeholders
  3. mode.nextPhase(room, currentPhase)
     - If null → go to reveal:
         mode.buildAlbums(room) → room.albums
         room.state = 'reveal'
         broadcastState → emitRevealForLayout (stepper: emitRevealSlide; others: emitRevealAlbum)
     - If next phase descriptor:
         compute endsAt (null for masterpiece-draw)
         room.currentPhase = { name, round, endsAt, submitted: new Set() }
         broadcastState → emitAssignments → startRoomTimer
```

### Timer Loop (1s interval per room)

```
setInterval (1s):
  → emit phase:tick { endsAt }
  → if supportsManualAdvance: check 15-min hard cap
  → else: if now >= endsAt → advancePhase
```

---

## 5. Data Model (in-memory)

```js
// server/rooms.js: rooms = Map<code, Room>

Room {
  code: string            // 4-char A-Z + 2-9, no 0/O/1/I
  hostId: string          // current host playerId
  state: 'lobby' | 'playing' | 'reveal' | 'ended'
  settings: {
    mode: string          // key into modes registry
    writeSeconds: number  // 20-180
    drawSeconds: number   // 30-240
    describeSeconds: number // 15-120
    knockoffShowSeconds: number // 3-20
  }
  players: Player[]
  albums: Album[] | []    // populated at reveal
  currentPhase: {
    name: string          // phase name per CONTRACT
    round: number
    endsAt: number | null // unix ms, null = no auto-advance
    submitted: Set<playerId>
  } | null
  revealCursor: { albumIdx, slideIdx } | null
  // v1.1 additions
  seatOrder: string[] | null
  masterprompt: string | null
  backgroundId: string | null
  revealLayout: 'stepper' | 'frame-cycle' | 'gallery' | 'scrollback' | null
  createdAt: number
  lastActivityAt: number
  // Non-serialized internals
  _timer: NodeJS interval handle | null
  _phaseStartedAt: number
  _roundData: Map<round, Map<playerId, Slide>>
  _soloPrompt: string | null   // Solo mode only
  _totalRounds: number         // set at buildAlbums time
  _joinUrl: string             // set on room:create
}

Player {
  id: string              // p_ + nanoid(10)
  name: string            // max 16 chars
  emoji: string
  color: string           // from PLAYER_COLORS[joinIdx % 16]
  isHost: boolean
  connected: boolean
  socketId: string
  joinedAt: number
}

Album = Slide[]

Slide {
  type: 'text' | 'drawing'
  authorId: string
  content: string         // text (max 300 chars) or JPEG data URI (max 250KB)
  phase: string
  round: number
}
```

`serializeRoom` strips all `_` internal fields and converts `submitted` Set to Array. Albums are only included when `state === 'reveal' || state === 'ended'`.

---

## 6. Mode Strategy Interface

All modes in `server/modes/*.js` export:

```js
{
  id: string
  displayName: string
  description: string
  revealLayout: 'stepper' | 'frame-cycle' | 'gallery' | 'scrollback'
  supportsManualAdvance: boolean
  validateStart(room) → string | null
  initialPhase(room) → { name, round, seconds }
  nextPhase(room, currentPhase) → { name, round } | null  // null = go to reveal
  buildAlbums(room) → Album[]
  assignmentForPlayer(room, playerIdx, phase) → { prevSlide, prevImage, eraseRect, meta }
  postSubmit?(room, player, slide) → void  // optional hook
}
```

Mode dispatch in `game.js`: `modes[room.settings.mode] || modes.classic` — unknown mode names fall back to classic, preventing a crash.

---

## 7. Reveal Layouts

| Layout | Modes | Server Event | Navigation |
|---|---|---|---|
| `stepper` | Classic, Knock-Off, Co-Op, Missing Piece, Secret | `reveal:slide` (per slide) | `reveal:next/prev` step one slide at a time; at album end, advance to next album |
| `frame-cycle` | Animation | `reveal:album` (full album) | `reveal:next/prev` step album-by-album; client cycles frames at 3fps |
| `gallery` | Solo, Masterpiece, Background | `reveal:album` (full album) | `reveal:next/prev` are no-ops (single album for these modes) |
| `scrollback` | Story | `reveal:album` (full album) | `reveal:next/prev` step album-by-album; client shows full text column |

The `album.js` dual-mode script handles both host page (driven by server events) and standalone `/album/:code` page (driven by `room:state` snapshots from local state).

---

## 8. Infrastructure

- **Runtime**: Node 20, CommonJS
- **HTTP + WS**: Express 4 + Socket.io 4.7 on a single `http.createServer`
- **Frontend transport**: Vanilla ES modules via `<script type="module">`. Socket.io client from `/socket.io/socket.io.js` (served automatically by the Socket.io package)
- **Hosting**: Render.com free web service. Oregon region. Auto-deploy from `main`. Health check at `/health`
- **Idle reaper**: `rooms.js` setInterval every 5 minutes clears rooms with no connected players and `lastActivityAt` > 30 minutes ago. This caps memory leak in the common case.
- **Player reconnect**: 30-second grace timer in `game.js` `disconnect` handler. Within 30 seconds the player can rejoin with their stored `playerId` and resume their slot. After 30 seconds the player is removed.
- **Host disconnect**: After 30-second grace, if the disconnected player was host, `promoteNextHost` promotes the first remaining connected player.

---

## 9. ASCII Data Flow Diagram

```
BROWSER (Host)                  SERVER                    BROWSER (Player x N)
    |                              |                              |
    |--- room:create ------------->|                              |
    |<-- ACK {code, playerId} -----|                              |
    |                              |                              |
    |                              |<--- room:join (QR scan) -----|
    |                              |---- ACK {playerId, room} --->|
    |<-- room:state (broadcast) ---|--- room:state (broadcast) -->|
    |                              |                              |
    |--- room:settings ----------->|                              |
    |<-- room:state ---------------|--- room:state ------------->|
    |                              |                              |
    |--- game:start -------------->|                              |
    |<-- room:state (playing) ------|--- room:state (playing) --->|
    |                              |--- phase:assignment -------->| (per-player)
    |<-- phase:tick (1/s) ---------|--- phase:tick (1/s) ------->|
    |                              |                              |
    |                              |<--- phase:submit -----------| (each player)
    |<-- room:state (submitted+) --|--- room:state ------------->|
    |                              |                              |
    |    (all submitted OR timer)  |                              |
    |<-- room:state (next phase) --|--- room:state (next phase)->|
    |                              |--- phase:assignment -------->| (per-player)
    |            ...               |              ...             |
    |                              |                              |
    |    (final phase done)        |                              |
    |<-- room:state (reveal) ------|--- room:state (reveal) ---->|
    |<-- reveal:slide / :album ----|                              |
    |                              |                              |
    |--- reveal:next ------------->|                              |
    |<-- room:state + reveal:slide-|--- room:state ------------->|
    |            ...               |                              |
    |<-- room:state (ended) -------|--- room:state (ended) ----->|
```

---

## 10. Key Design Decisions

**No database**: Rooms exist only in process memory. Acceptable for a monthly scheduled event on a free tier. The 30-minute idle reaper prevents indefinite accumulation.

**Mode-dispatch pattern**: `server/game.js` is a thin dispatcher. All mode-specific logic (phase sequencing, album construction, per-player assignment) lives in `server/modes/*.js` strategy objects. Adding a new mode requires only a new file in `server/modes/` and a line in `server/modes/index.js`.

**Seat ordering abstraction**: `getSeatOrder(room)` is the single point where secret vs. normal ordering is resolved. Every mode that does chain calculations calls it, ensuring correct behavior for Secret mode without any other change.

**Client-side erase rect**: Missing Piece sends erase coordinates (not a modified image) to the receiving client. This eliminates server-side image processing and any associated `node-canvas` dependency. The erase rect is deterministically seeded per `(roomCode, round, albumIdx)` so every client arrives at the same rect without coordination.

**Dual-mode album.js**: A single script serves both the host page reveal panel and the standalone `/album/:code` viewer by checking which DOM elements exist on load (`isHostPage`, `isAlbumPage`). This avoids duplicating the four layout renderers at the cost of some conditional branching.

**`submitInFlight` guard**: A module-level boolean in `play.js` prevents concurrent submits from double-firing due to the auto-submit timer and the manual submit button firing in close succession. The deeper race condition (new phase assignment arriving mid-submit) is documented as a known-deferred item and defended by the `checkAllSubmitted` check on the server, which ignores already-submitted players.

**CORS open wildcard**: Socket.io is configured with `origin: '*'`. Acceptable for a public party game with no authentication.

**No rate limiting**: There is no rate limiting on socket events. Malicious clients can spam `phase:submit` indefinitely. The `submitted.has(player.id)` guard prevents duplicate submissions from counting, but it does not prevent server-side processing overhead. Acceptable for a 16-player trusted audience.
