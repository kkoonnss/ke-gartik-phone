# Agent A — Server (Node + Express + Socket.io)

## Your scope
Build the entire backend: HTTP server, static asset serving, Socket.io game state machine, room lifecycle, timers, QR generation endpoint.

## Files you own (write ONLY these)
- `server/index.js`
- `server/rooms.js`
- `server/game.js`
- `server/prompts.js`

## Required reading before you write code
- `_Briefs/CONTRACT.md` — locked event names, payload shapes, validation caps, state machine, mode variants, album construction rules. **Do not deviate.**
- `_Briefs/ke-gartik-phone-scope.md` — overall product context

## What to build

### `server/index.js` (entry point)
- Express app on `process.env.PORT || 3000`
- Serve `public/` as static
- Express routes:
  - `GET /` → serve `public/index.html`
  - `GET /host/:code` → serve `public/host.html` (any 4-char code; client validates)
  - `GET /play/:code` → serve `public/play.html`
  - `GET /album/:code` → serve `public/album.html`
  - `GET /health` → `{ ok: true, rooms: <count>, uptimeSec }` (used by deploy smoke check)
  - `GET /api/qr?text=...` → returns PNG data URI as `{ dataUrl }` — uses `qrcode` package
- Attach Socket.io to the HTTP server
- Hand the io instance to `game.js` via `attachGame(io)`

### `server/rooms.js`
- `createRoom(hostPlayer)` → returns `{ code, room }`; generates a unique 4-char code from alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no ambiguous chars per CONTRACT)
- `getRoom(code)` → room or null
- `joinRoom(code, player)` → mutates room, enforces 16-player cap, returns `{ ok, isHost, room }`
- `removePlayer(roomCode, playerId)` — used on disconnect (after grace period)
- `serializeRoom(room)` → the `room:state` snapshot per CONTRACT. **Always returns the `submitted` field as an array (not a Set) so JSON.stringify works.**
- Room object shape per CONTRACT section "Data Model"
- Idle reaper: drop rooms with no connected players for 30 min

### `server/game.js`
- `attachGame(io)` wires up all socket event handlers
- Handles: `room:create`, `room:join`, `room:settings`, `game:start`, `phase:submit`, `phase:skip`, `reveal:next`, `reveal:prev`
- Handles `disconnect`: mark player `connected:false`, after 30s grace remove if still disconnected, broadcast `room:state`
- Maintains per-room timer interval that:
  - Emits `phase:tick` every 1000ms
  - On `endsAt` passing OR all players submitted, advances phase
- `advancePhase(room)` implements the state machine per CONTRACT:
  - **Classic**: write → draw → describe → draw → describe → ... until total slides = N players, then reveal
  - **Knockoff**: write → knockoff-show (auto, all players see prev simultaneously) → knockoff-draw → knockoff-show → knockoff-draw → ... 
  - **Solo**: pull one prompt from `prompts.js`, single draw phase, then reveal
- On entering a draw/describe/write phase: per-player emit `phase:assignment` with the slide that player is acting on (based on chain assignment from album construction rules)
- On reveal entry: build `room.albums` from collected slides, set `revealCursor = {albumIdx:0, slideIdx:0}`, emit `room:state` (state=reveal). Emit `reveal:slide` for current cursor.
- `reveal:next`/`reveal:prev`: advance cursor; when slideIdx exceeds album length, jump to next album; when last slide of last album, state=ended.

### `server/prompts.js`
- Export an array of ~30 starter prompts for Solo mode, motion-design / Monday Meeting flavored. Examples: "A motion designer's nightmare", "What 3am After Effects looks like", "The new Cinema 4D mascot", "When the render finally finishes", "A keyframe in love", "Greenscreen on a Monday", "If Houdini had a band", "Render farm uprising". Keep them PG-13, playful, motion-design adjacent.

## Implementation notes
- Use `require()` (CommonJS), Node 20 native runtime, no transpiler.
- Use `nanoid` for player IDs: `nanoid(10)`.
- Use `qrcode.toDataURL(url)` for QR generation.
- For `phase:submit`, validate per CONTRACT validation caps. On `PAYLOAD_TOO_LARGE`, emit `error` to that socket only.
- **Critical correctness**: the chain rotation for album construction must match CONTRACT exactly. Album j slide i is authored by player `(j + i) mod N` in the seat order. The prevSlide passed to player `(j + i) mod N` for slide i is album[j].slides[i-1].
- Time accounting: store `endsAt` as `Date.now() + secs*1000`. Server is the source of truth; clients display countdowns derived from `endsAt`.
- All state mutations must be followed by a `room:state` broadcast (except `phase:tick` which doesn't need it).

## Definition of done
- Server starts cleanly with `npm install && npm start`
- A two-player end-to-end run via two `socket.io-client` instances completes write → draw → describe and reaches reveal
- `/health` returns ok
- `/api/qr?text=https://example.com/?room=ABCD` returns a valid PNG data URI
- No uncaught exceptions on player disconnect mid-round
- File ownership respected — only the four files listed above are created/edited

## Where to report when done
Write a short completion note to `_Briefs/agent-A-done.md` listing:
- Files created
- Anything in CONTRACT that you wanted to change but didn't (so the orchestrator can review)
- A 3-line description of how to manually test it
