# CONTRACT_v4.md — Host-as-Player + Game Restart (Locked)

Backward-compatible additive changes. Two features:
1. **game:reset** — host returns the room to lobby from any state, keeping players, room code, QR, seat order, and settings. Powers "Play Again" (after a game) and "Back to Lobby" (bail out of a stuck round / change mode without re-joining).
2. **Host-as-player** — the host page (`/host/:code`) lets the host participate (write/draw/describe/vote) directly, instead of being a controller-only screen. The computer is a full player AND the control surface.

---

## 1. New Server Event

### `game:reset` (host only)
No payload. Valid in ANY non-lobby state (`playing`, `reveal`, `ended`).

Server actions:
- Stop/clear the room timer (`clearRoomTimer`)
- Clear `room._advancing` flag
- Set `room.state = 'lobby'`
- Clear: `room.currentPhase = null`, `room.albums = []`, `room.revealCursor = null`, `room.revealLayout = null`, `room.votes = null` (or fresh empty structure), `room._roundData = new Map()`, `room._totalRounds = undefined`, `room._soloPrompt = undefined`, `room._phaseStartedAt = undefined`
- KEEP: `room.players` (everyone stays joined), `room.code`, `room.hostId`, `room.seatOrder`, `room.settings`, `room.masterprompt`, `room.backgroundId`, `room.customPrompts`
- Reset each player's submitted state implicitly (it lives in currentPhase which is now null)
- Broadcast `room:state` (now state=lobby) so every connected client returns to the lobby/waiting view

Validation: only the host (`player.isHost`) may call it; otherwise emit `error` `{ code: 'NOT_HOST' }`.

After reset, the existing `game:start` (which requires `state === 'lobby'`) works normally — the host picks a mode and starts again. Players already in the room just see the lobby again; no re-join, no new QR.

---

## 2. Host-as-Player Integration

### Goal
On `/host/:code`, the host can play the game (write/draw/describe/vote) without opening a second tab. The host page becomes both the control surface and a player surface.

### Approach (DRY — reuse play.js)
Load the player logic (`canvas.js` + `play.js`) on `host.html` in addition to `host.js`. The host page gains the player screens (same element IDs play.html uses). `play.js` drives those screens off `phase:assignment`; `host.js` keeps driving the control panels.

### host.html additions
Add the SAME player screen markup that `play.html` has, inside a new wrapper `<div id="host-play-area">` placed after the existing `<main>` content (or in a sensible spot). Required element IDs (must match play.js expectations exactly — copy from play.html):
- `#waiting-screen`, `#waiting-message`, `#waiting-players`
- `#write-screen`, `#write-countdown`, `#write-prompt-label`, `#write-input`, `#write-submit`
- `#draw-screen`, `#draw-countdown`, `#draw-prompt-display`, `#draw-canvas`, `#draw-toolbar`, `#draw-submit`
- `#describe-screen`, `#describe-countdown`, `#describe-image`, `#describe-input`, `#describe-submit`
- `#knockoff-show-screen`, `#knockoff-show-countdown`, `#knockoff-show-image`
- `#spectator-screen`, `#spectator-message`
- `#error-toast`

Add script tags at the bottom of host.html (after host.js, album.js):
```html
<script type="module" src="/js/canvas.js"></script>
<script type="module" src="/js/play.js"></script>
```

### play.js changes (must NOT break standalone play.html)
play.js must detect whether it's running on the host page vs the player page:
```js
const isHostPage = !!document.getElementById('host-root');
```
On the host page:
- DO render write/draw/describe/knockoff/spectator screens during their phases (host participates)
- Do NOT render the `#waiting-screen` during lobby — the host uses the settings panel as their lobby view. Instead, keep the host-play-area hidden/empty during lobby state.
- Do NOT redirect away (the redirect-if-no-playerId logic must not fire on host page; the host always has a stored playerId from room:create)
- The vote panel (during reveal) MAY render on the host page so the host can vote too — but it must not cover the reveal controls. Coordinate via CSS (see below).

On the player page (play.html): behavior unchanged from v0.3.

### host.js changes
- During `state === 'playing'`: host.js should HIDE the big `#settings-panel` (already does) and may collapse `#phase-status` into a compact strip so the play screen has room. The play screens (driven by play.js) are the host's main interaction area.
- Add "Play Again" + "Back to Lobby" buttons (see §3).
- host.js must not hide/show the player screens — that's play.js's job. They coordinate by state, not by fighting over the same elements.

### Visibility coordination (critical)
The host page now has TWO families of UI:
- Control family (host.js): `#settings-panel`, `#phase-status`, `#reveal-panel`
- Play family (play.js): `#waiting-screen`, `#write-screen`, `#draw-screen`, etc. inside `#host-play-area`

Rules:
- **lobby**: show `#settings-panel`; `#host-play-area` hidden (play.js suppresses waiting screen on host page); `#phase-status` and `#reveal-panel` hidden.
- **playing**: hide `#settings-panel`; show compact `#phase-status` (countdown + skip); show `#host-play-area` with the active play screen (write/draw/describe).
- **reveal/ended**: hide `#host-play-area`'s play screens; show `#reveal-panel` with reveal controls + vote tally + winners gallery. (The host votes via the reveal panel context if desired — keep it simple: host can use the vote panel that play.js renders in `#spectator-screen`, OR skip host voting. Minimum: don't let the spectator screen cover the reveal controls. Hide `#host-play-area` during reveal so only the reveal panel shows.)

The simplest robust rule: **`#host-play-area` is visible only during `state === 'playing'`.** During lobby and reveal/ended it's hidden. This avoids all overlap. The host votes are a nice-to-have; if hiding host-play-area during reveal removes the host's vote panel, that's acceptable for v0.4 (host runs the reveal; players vote from phones).

---

## 3. Restart UI (host.html + host.js)

Add two buttons:
- **"PLAY AGAIN"** `#m-play-again` — placed inside `#reveal-panel` (shown during reveal/ended). On click: `socket.emit('game:reset')`. After reset, the host lands back on the lobby/settings view automatically (via room:state).
- **"BACK TO LOBBY"** `#m-back-to-lobby` — placed inside `#phase-status` (shown during playing) next to Skip. Lets the host bail a stuck round. On click: `confirm('End this round and return everyone to the lobby?')` then `socket.emit('game:reset')`.

Both reuse the single `game:reset` event. CSS classes follow existing button styles (`host__button`, `host__button--primary` / `--ghost`).

---

## 4. File Ownership

| Agent | Owns |
|---|---|
| SRV (server reset) | `server/game.js`, `server/rooms.js` |
| HOSTPLAY (host-as-player + restart UI) | `public/host.html`, `public/js/host.js`, `public/js/play.js`, `public/css/styles.css` |

Disjoint. `album.js`, `canvas.js`, `sounds.js`, `index.js`, `server/modes/*` are NOT modified.

Note: play.js is shared by play.html and host.html. HOSTPLAY must keep play.html behavior identical while adding host-page support.

---

## 5. Acceptance Criteria

1. Host on `/host/:code` sees the settings panel in lobby (no waiting screen).
2. When game starts, the host sees the write/draw/describe screens and can submit like any player. The host's submissions appear in the album.
3. The host's submission counts toward `checkAllSubmitted` so rounds advance when everyone (including host) submits — no more waiting for the full timer just because the host didn't play.
4. During reveal, the host sees the reveal controls (and tally/winners). The play screens are hidden.
5. "Play Again" at end resets to lobby; all players (host + phones) return to lobby WITHOUT re-joining; same room code + QR; host picks a mode and starts again.
6. "Back to Lobby" mid-round does the same from the playing state.
7. play.html (phone players) behavior is UNCHANGED.
8. No duplicate/ghost player created for the host.
9. No console errors from two scripts (host.js + play.js) sharing the page.

---

## 6. Tech Notes
- getSocket() is a singleton — host.js and play.js share one socket. Both emitting room:join with the same stored playerId is a harmless reconnect.
- play.js reads identity from localStorage (same as host.js). On host page the identity already exists from room:create.
- Server still CommonJS. Frontend vanilla ES modules.
- Version will bump to 0.4.0 after QC.

If anything feels wrong, STOP and report rather than diverging.
