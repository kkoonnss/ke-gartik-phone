# Agent B — Lobby + Host UI

## Your scope
Wire up the landing page (create/join) and the host control panel including QR rendering, player list, settings, start button, in-game phase status. The reveal UI on host.html is handled by Agent D; you must NOT touch reveal-related elements.

## Files you own (write ONLY these)
- `public/js/lobby.js`
- `public/js/host.js`

## Pre-written files you read and target
- `public/index.html` — DOM IDs listed under "DOM Element ID Map" in `_Briefs/CONTRACT.md`
- `public/host.html` — same
- `public/js/socket-client.js` — use `getSocket`, `emitAck`, `getStoredName`, `getStoredEmoji`, `setStored*`, `setStoredPlayerId`, `getRoomCodeFromQuery`, `getRoomCodeFromPath`

## Required reading
- `_Briefs/CONTRACT.md` — DOM IDs, socket events, validation caps
- `_Briefs/ke-gartik-phone-scope.md` — context

## What to build

### `public/js/lobby.js` — for `index.html`
- On load, auto-fill `#join-code` from `?room=` query (uppercased)
- Auto-fill `#create-name`, `#join-name` from `getStoredName()`; emoji from `getStoredEmoji()`
- Wire `#create-form` submit:
  - Validate name (1-16 chars)
  - `emitAck('room:create', { name, emoji })` → on success, persist name/emoji/playerId, navigate to `/host/${code}`
  - On error, show in `#error-banner`
- Wire `#join-form` submit:
  - Validate code (4 chars), name
  - Include `resumePlayerId: getStoredPlayerId()` if present
  - `emitAck('room:join', {code, name, emoji, resumePlayerId})` → on success, persist, navigate to `/play/${code}`
  - On error, show in banner
- Both submit buttons: disable while in-flight to prevent double-create races

### `public/js/host.js` — for `host.html`
- On load:
  - Read code from `getRoomCodeFromPath()`
  - If no playerId in localStorage, redirect to `/?room=${code}` (lobby will rejoin them)
  - Otherwise call `emitAck('room:join', {code, name, emoji, resumePlayerId: storedId})` to attach the socket
  - Fetch QR for the join URL: `fetch('/api/qr?text=' + encodeURIComponent(joinUrl))` → set `#qr-image` src
  - Set `#join-url` to the human-readable URL (e.g., `your-app.onrender.com/?room=ABCD`)
- Listen to `room:state` and render:
  - `#room-code` ← state.code
  - `#player-list` ← state.players (chip per player: emoji + name + grey-out if !connected + (host) label)
  - When `state.state === 'lobby'`: show `#settings-panel`, hide `#phase-status`, hide `#reveal-panel`
  - When `state.state === 'playing'`: hide settings, show `#phase-status`, render `#phase-name`, `#submitted-count` (`X/N submitted`)
  - When `state.state === 'reveal'` or `ended`: hide `#phase-status`. Agent D handles `#reveal-panel` visibility — do not touch it.
- Listen to `phase:tick`:
  - Compute `Math.max(0, Math.ceil((endsAt - Date.now())/1000))` and write into `#phase-countdown`
- Wire `#start-game`:
  - Read settings inputs, emit `room:settings` then `game:start`
- Wire `#skip-phase` → emit `phase:skip`
- Settings inputs: on change, emit `room:settings` with the full settings object (only the host can; server will reject otherwise — handle the `error` event by showing a small toast)
- Listen for `error` events from the socket and show a banner (you can create one dynamically at top of `#host-root`)

### Player list rendering
For each player in `state.players`, render `<li class="host__player">` with inline color dot using `player.color`, the emoji span, and name. Mark host with " ★" or a `.host__player--host` modifier class.

## Implementation notes
- Use ES module imports from `socket-client.js`.
- Do NOT touch any element ID listed in CONTRACT under the "reveal" group (`#reveal-*`). Those belong to Agent D.
- Keep DOM updates idempotent: each `room:state` rebuilds the player list from scratch (innerHTML = '' then append).
- Mode-specific countdown handling: just show whatever `currentPhase.name` is — no special-case rendering needed.
- Display the room code in bold uppercase, always 4 chars.

## Definition of done
- Create room flow works end-to-end → host page loads with valid QR and visible room code
- Joining via another browser shows the new player in `#player-list` within ~1s
- Start game button transitions UI to playing state, countdown ticks down
- File ownership respected — only `lobby.js` and `host.js`

## Report when done
Write `_Briefs/agent-B-done.md` with: files written, any gotchas encountered, manual test steps.
