# CONTRACT.md — Locked Inter-Module Contract

**This file is the single source of truth for socket events, data shapes, file ownership, and DOM element IDs across all sub-agents working on KE_GartiK_Phone.**

If you are a sub-agent reading this: do NOT invent new events, rename existing ones, or change data shapes. If you believe a change is required, stop work and report it back to the orchestrator. Other agents are building against this contract in parallel.

---

## File Ownership

| Agent | Owns (you may write/edit ONLY these files) |
|---|---|
| A: Server | `server/index.js`, `server/rooms.js`, `server/game.js`, `server/prompts.js` |
| B: Lobby + Host | `public/js/lobby.js`, `public/js/host.js` |
| C: Player + Canvas | `public/js/play.js`, `public/js/canvas.js` |
| D: Album Reveal | `public/js/album.js` |
| E: Theming | `public/css/theme.css`, `public/css/styles.css`, files under `public/assets/` |
| F: Deploy | `render.yaml`, `Procfile`, `.gitignore`, `README.md` at repo root; may add a `/health` route comment-marker (server agent implements the actual route) |

**Shared / pre-written by orchestrator (do not edit):**
- `public/index.html`, `public/host.html`, `public/play.html`, `public/album.html`
- `public/js/socket-client.js`
- `package.json`
- `CONTRACT.md` (this file)

---

## DOM Element ID Map

Each HTML page exposes the following IDs. JS agents target these directly. CSS agent styles them via class names listed.

### `public/index.html` (Lobby) — Agent B targets
- `#landing` — root container
- `#create-form` — form with name, emoji
- `#create-name` — input
- `#create-emoji` — input
- `#create-submit` — button
- `#join-form` — form with code, name, emoji
- `#join-code` — input (auto-fills from `?room=`)
- `#join-name` — input
- `#join-emoji` — input
- `#join-submit` — button
- `#error-banner` — error display
- Classes for CSS: `.lobby`, `.lobby__card`, `.lobby__title`, `.lobby__input`, `.lobby__button`, `.lobby__button--primary`, `.lobby__button--secondary`, `.error-banner`

### `public/host.html` (Host control panel) — Agent B targets, Agent D for reveal mode
- `#host-root`
- `#room-code` — large room code display
- `#qr-image` — `<img>` for QR data URI
- `#join-url` — text of joinable URL
- `#player-list` — `<ul>`
- `#settings-panel` — form
- `#setting-mode` — `<select>` with `classic`, `knockoff`, `solo`
- `#setting-write` — number input
- `#setting-draw` — number input
- `#setting-describe` — number input
- `#start-game` — button
- `#phase-status` — current phase + countdown during play
- `#phase-countdown` — seconds remaining
- `#submitted-count` — "5/8 submitted"
- `#skip-phase` — button
- `#reveal-panel` — hidden until state=reveal (Agent D unhides)
- `#reveal-image` — current slide visual
- `#reveal-text` — current slide text
- `#reveal-author` — slide author
- `#reveal-next` — button (Agent D wires)
- `#reveal-prev` — button (Agent D wires)
- `#reveal-position` — "Album 2/6 · Slide 3/12"
- Classes: `.host`, `.host__qr`, `.host__code`, `.host__players`, `.host__player`, `.host__settings`, `.host__phase`, `.host__reveal`

### `public/play.html` (Player game UI) — Agent C targets
- `#play-root`
- `#waiting-screen` — visible when phase=lobby
- `#waiting-players` — list of players
- `#waiting-message` — "Waiting for host to start..."
- `#write-screen` — visible when phase=write
- `#write-prompt-label` — "Type a sentence..."
- `#write-input` — `<textarea>`
- `#write-submit` — button
- `#write-countdown` — seconds remaining
- `#draw-screen` — visible when phase=draw or knockoff-draw
- `#draw-prompt-display` — shows the text/image the player is drawing from
- `#draw-canvas` — `<canvas>`
- `#draw-toolbar` — container
- `#draw-submit` — button
- `#draw-countdown`
- `#describe-screen` — visible when phase=describe
- `#describe-image` — shows the drawing to describe
- `#describe-input` — `<textarea>`
- `#describe-submit` — button
- `#describe-countdown`
- `#knockoff-show-screen` — temporary view of a drawing before redraw
- `#knockoff-show-image`
- `#knockoff-show-countdown`
- `#spectator-screen` — shown when player has submitted and is waiting on others / during reveal
- `#spectator-message`
- `#error-toast`
- Classes: `.play`, `.play__screen`, `.play__prompt`, `.play__canvas-wrap`, `.play__toolbar`, `.play__color`, `.play__brush`, `.play__btn`, `.play__btn--primary`, `.play__countdown`, `.play__textarea`

### `public/album.html` (Standalone album viewer, post-game) — Agent D targets
- `#album-root`
- `#album-title` — "Monday Meeting · Game Night Album"
- `#album-player` — main display
- `#album-slide-image`
- `#album-slide-text`
- `#album-slide-author`
- `#album-next`
- `#album-prev`
- `#album-position`
- Classes: `.album`, `.album__slide`, `.album__author`, `.album__nav`

---

## Socket.io Event Contract

Connection: client connects to `/` (default), no auth, cookie carries `playerId` if reconnecting.

### Client → Server

#### `room:create`
```js
{ name: "Kons", emoji: "🎨" }
```
ACK callback receives:
```js
{ ok: true, code: "KZQM", playerId: "p_abc", joinUrl: "https://..." }
// or
{ ok: false, error: "..." }
```

#### `room:join`
```js
{ code: "KZQM", name: "Maya", emoji: "🐙", resumePlayerId?: "p_xyz" }
```
ACK: `{ ok, playerId, isHost, room? }`. If room is full or doesn't exist, `ok:false`.

#### `room:settings` (host only)
```js
{ mode: "classic"|"knockoff"|"solo", writeSeconds, drawSeconds, describeSeconds, knockoffShowSeconds }
```
No ACK needed; server broadcasts `room:state` on success.

#### `game:start` (host only)
No payload. Server validates ≥2 players, transitions to first phase.

#### `phase:submit`
```js
{ phase: "write"|"draw"|"describe"|"knockoff-draw", round: 1, content: "..." }
```
- For text phases (write/describe): `content` is a trimmed string, max 300 chars.
- For draw phases: `content` is a JPEG data URI, max 250KB. Server validates size + prefix `data:image/jpeg;base64,`.

#### `phase:skip` (host only)
Forces server to advance immediately, treating non-submitters as auto-submitted (blank canvas / "..." text).

#### `reveal:next` / `reveal:prev` (host only)
Advances/retreats reveal cursor by one slide.

### Server → Client

All broadcasts are scoped to the room.

#### `room:state`
Full snapshot. Sent on any state change.
```js
{
  code, hostId,
  state: "lobby"|"playing"|"reveal"|"ended",
  settings: { mode, writeSeconds, drawSeconds, describeSeconds, knockoffShowSeconds },
  players: [{ id, name, emoji, color, isHost, connected }],
  currentPhase: { name, round, endsAt, submitted: ["p_abc", ...] } | null,
  revealCursor: { albumIdx, slideIdx } | null,
  joinUrl: "https://.../?room=KZQM"
}
```

#### `phase:tick`
```js
{ endsAt: 1700000000000 }  // server-authoritative deadline
```
Sent every 1s during an active phase so clients can render countdowns without drift.

#### `phase:assignment`
Per-player (uses socket emit to socketId, not broadcast).
```js
{
  phase: "draw"|"describe"|"knockoff-show"|"knockoff-draw",
  round: 2,
  prevSlide: { type: "text"|"drawing", content: "..." } | null,
  deadline: 1700000000000
}
```
For phase `write`: server still emits this with `prevSlide: null` for consistency.
For `knockoff-show`: the prevSlide is the drawing to memorize; client auto-transitions to `knockoff-draw` after `knockoffShowSeconds`.

#### `reveal:slide` (broadcast)
```js
{
  albumIdx: 0,
  slideIdx: 2,
  slide: { type, content, authorId, round, phase },
  author: { id, name, emoji, color },
  total: { albums: 6, slidesInAlbum: 12 }
}
```

#### `error`
```js
{ code: "ROOM_FULL"|"ROOM_NOT_FOUND"|"NOT_HOST"|"BAD_PHASE"|"PAYLOAD_TOO_LARGE"|"VALIDATION", message: "..." }
```

---

## State Machine

```
lobby
  └── (host: game:start)
       └── phase: write                  [round=0, all players write a starting prompt]
            └── (all submit or timeout)
                 └── phase: draw         [round=1, each player gets prev player's text]
                      └── phase: describe[round=2, each player gets prev player's drawing]
                           └── phase: draw      [round=3]
                                └── ... (continue until round = #players)
                                     └── state: reveal
                                          └── (host: reveal:next * N)
                                               └── state: ended
```

**Mode variants:**
- **classic**: as above.
- **knockoff**: after write/draw, server inserts a `knockoff-show` phase (auto-advance) before each subsequent draw — player sees prev drawing for `knockoffShowSeconds`, then redraws from memory. Skips describe phases.
- **solo**: server picks ONE prompt from `prompts.js`, all players draw it simultaneously in a single `draw` phase, then state jumps to reveal with one album = everyone's drawings of the same prompt.

---

## Album Construction Rules

For classic mode with N players:
- N albums, each starting with a different player's prompt
- Each album has N slides total (alternating draw/describe)
- Slide i in album j is authored by player `(j + i) mod N` in the seat order
- After all phases complete, server constructs `albums: Album[]` and stores on room

For solo mode:
- 1 album containing all players' drawings of the shared prompt
- Slide 0 is the prompt (type: text, authorId: "system")
- Slides 1..N are each player's drawing

For knockoff mode:
- Like classic but album slides alternate `draw` (no describe). Length = N.

---

## Player Color Palette (Agent C and E both reference)

Pre-assigned in order of join:
```
['#ff5a5f', '#ffb400', '#ffe066', '#00d68f', '#00b8d9', '#5e72e4', '#b06ab3', '#ff7a59',
 '#7ed957', '#ff5ec4', '#36d1c4', '#ffa600', '#a78bfa', '#f87171', '#34d399', '#60a5fa']
```

## Player Emoji Pack (Agent B and E reference)

Players pick one at join, defaults to first available:
```
['🎨','🐙','🦊','🐲','🦄','🌮','🍕','🚀','👾','🎬','🎧','🪩','🌈','⚡','🔮','🧙','🦴','🐝','🦖','🐳','🛸','🎭','🎲','🌵']
```

---

## Validation Caps

| Field | Cap |
|---|---|
| Display name | 16 chars |
| Room code | 4 chars, A-Z + 2-9 (no 0/O/1/I) |
| Text submission | 300 chars |
| Drawing submission | 250KB JPEG data URI |
| Players per room | 16 |
| Settings: writeSeconds | 20–180 |
| Settings: drawSeconds | 30–240 |
| Settings: describeSeconds | 15–120 |
| Settings: knockoffShowSeconds | 3–20 |

---

## Tech Notes for All Agents

- Server is Node 20, ESM not enabled — use **CommonJS** (`require`).
- Frontend is **vanilla JS**, no bundler. Use ES modules via `<script type="module">` already declared in the HTML shells.
- Socket.io client is loaded from CDN already in HTML shells; agents just use `window.io`.
- Player id is stored in `localStorage` under `gartik.playerId` so reconnects work.
- Last-used name/emoji stored in `localStorage` under `gartik.name` / `gartik.emoji`.

If anything in this contract feels wrong while you're building, **stop and report**. Do not silently diverge.
