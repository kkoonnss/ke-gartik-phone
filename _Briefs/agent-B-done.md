# Agent B — Done

## Files Written

- `public/js/lobby.js`
- `public/js/host.js`

Both are ES modules using `import` from `./socket-client.js`, matching the `<script type="module">` tags already in the HTML shells.

---

## What Was Built

### lobby.js
- On load: auto-fills `#create-name`, `#join-name` from `getStoredName()`; emoji fields from `getStoredEmoji()`.
- Auto-fills `#join-code` from `?room=` query param (uppercased); scrolls join form into view and focuses the name input.
- `#create-form` submit: validates name 1–16 chars, disables submit button during in-flight `emitAck('room:create')`, persists name/emoji/playerId on success, navigates to `/host/<code>`.
- `#join-form` submit: validates code 4 chars + name, includes `resumePlayerId` from localStorage if present, navigates to `/host/<code>` if `isHost` or `/play/<code>` otherwise.
- All errors surface in `#error-banner`.

### host.js
- On load: reads code from `getRoomCodeFromPath()`. Redirects to `/` if missing. Redirects to `/?room=<code>` if no stored playerId.
- Rejoins via `emitAck('room:join', { code, name, emoji, resumePlayerId })` — uses stored identity.
- Fetches QR from `/api/qr?text=<joinUrl>` and sets `#qr-image` src. Handles both `{ dataUri }` and `{ svg }` response shapes; fails silently (text URL always shown).
- `room:state` handler: updates `#room-code`, rebuilds `#player-list`, syncs settings inputs, and toggles `#settings-panel` / `#phase-status` visibility based on `state.state`. Never touches `#reveal-panel` or any `#reveal-*` / `#album-*` element.
- `phase:tick` handler: computes `Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))` and writes into `#phase-countdown`.
- Settings inputs wired with `change` listeners → `socket.emit('room:settings', readSettings())`.
- `#start-game` click: emits `room:settings` then `game:start`.
- `#skip-phase` click: emits `phase:skip`.
- `socket.on('error')` shows a fixed-position toast created dynamically inside `#host-root`.
- Player list chips: inline color dot (inline style using `player.color`) + emoji span + name span + ★ for host; disconnected players get 45% opacity on their name.

---

## Gotchas / Notes

1. **`/api/qr` response shape unknown.** The contract does not specify what the QR endpoint returns. I handled `{ dataUri }` (most common pattern) and `{ svg }` as a fallback. If the server agent returns a different shape, the QR image will silently fail — the text URL is always visible as a fallback. Server agent (A) should confirm the response shape.

2. **`knockoffShowSeconds` not exposed in `host.html` settings form.** The HTML has inputs for `writeSeconds`, `drawSeconds`, `describeSeconds` only. `readSettings()` therefore does not include `knockoffShowSeconds`; the server keeps its default. If the product needs it surfaced, a new input element must be added to `host.html` by the orchestrator (Agent B cannot edit HTML).

3. **Settings sync direction.** On each `room:state` while in lobby, settings inputs are synced from server state. This means if the server rejects a bad value and broadcasts corrected state, the UI will snap back — which is the correct, safe behavior.

4. **QR fetch error handling.** A failed `/api/qr` fetch is caught and swallowed. The join URL text (`#join-url`) is always set directly from `location.origin + '/?room=' + code` so the host can always share it manually.

5. **No `phase-name` element in CONTRACT's ID map but present in host.html.** `#phase-name` is correctly present in the HTML (`<div id="phase-name">`). Used it without concern.

---

## Manual Test Steps

1. Start the server (`node server/index.js` from repo root).
2. Open `http://localhost:PORT/` in Chrome.
   - Confirm name/emoji fields are empty on first visit.
   - Type a name, click CREATE ROOM.
   - Should navigate to `/host/<CODE>`.
3. On host page:
   - Room code should appear in `#room-code` (bold, 4-char uppercase).
   - QR image should load (or at minimum the text URL appears).
   - Settings panel should be visible; phase status hidden.
4. Open a second browser tab/window at `http://localhost:PORT/?room=<CODE>`.
   - Join code field should auto-fill with the room code.
   - Type a name, click JOIN.
   - Should navigate to `/play/<CODE>`.
5. Back on host tab: new player should appear in `#player-list` within ~1s with color dot + emoji + name. Host entry should show ★.
6. Click START GAME on host.
   - Settings panel should hide; phase status panel should appear with phase name + countdown ticking down.
7. Click SKIP PHASE: server should advance the phase; countdown resets.
8. Change a settings input while in lobby: no error toast should appear (settings accepted by server).
9. Simulate disconnect: kill server, reload host page — redirect to `/` expected on rejoin failure.
