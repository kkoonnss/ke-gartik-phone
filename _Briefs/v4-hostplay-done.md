# v4-hostplay-done.md — HOSTPLAY agent delivery report

Agent: HOSTPLAY
Date: 2026-05-26
Files modified: public/host.html, public/js/host.js, public/js/play.js, public/css/styles.css

---

## What was done

### 1. host.html additions

Added `<div id="host-play-area" hidden>` outside `</main>` but inside `#host-root`. It contains the exact player screen markup copied from play.html:
- `#waiting-screen` + `#waiting-message` + `#waiting-players`
- `#write-screen` + `#write-countdown` + `#write-prompt-label` + `#write-input` + `#write-submit`
- `#draw-screen` + `#draw-countdown` + `#draw-prompt-display` + `#draw-canvas` + `#draw-toolbar` + `#draw-submit`
- `#describe-screen` + `#describe-countdown` + `#describe-image` + `#describe-input` + `#describe-submit`
- `#knockoff-show-screen` + `#knockoff-show-countdown` + `#knockoff-show-image`
- `#spectator-screen` + `#spectator-message`
- `#error-toast`

Script tags added at bottom (after host.js, album.js):
```html
<script type="module" src="/js/canvas.js"></script>
<script type="module" src="/js/play.js"></script>
```

Restart buttons added:
- `#m-play-again` inside `#reveal-panel` — class `host__button host__button--primary`
- `#m-back-to-lobby` inside `#phase-status` — class `host__button host__button--ghost`

### 2. play.js isHostPage branch

Added immediately after `import { initCanvas }`:
```js
const isHostPage = !!document.getElementById('host-root');
```

Host-page guards added:

**renderWaiting**: Returns immediately if `isHostPage`. The host uses the settings panel (lobby) or phase-status (playing-but-no-assignment). host.js hides `#host-play-area` during lobby so there's nothing to show.

**applyState — reveal/ended branch**: Returns immediately if `isHostPage`. host.js hides `#host-play-area` during these states; the host uses the reveal panel (managed by album.js/host.js). Phone player behaviour (renderSpectator with vote panel) is unchanged.

**init — redirect guard**: `window.location.href = '/?room=${roomCode}'` only fires if `!isHostPage && (!myPlayerId || !name)`. The host always has a stored identity from room:create.

**init — failed join redirect**: `window.location.href` for failed join only fires if `!isHostPage`.

**init — failed join fallback showScreen**: When resp.room is absent the fallback `showScreen('waiting-screen')` is called but is a harmless no-op on host page because `#host-play-area` is still hidden (host.js only shows it when state=playing and has received room:state).

All other play.js behaviour (write/draw/describe/spectator/vote during playing state) is completely unchanged and runs identically on both pages.

### 3. host.js visibility logic

Added three new DOM refs at the top (outside init):
```js
const hostPlayArea = document.getElementById('host-play-area');
const mPlayAgain   = document.getElementById('m-play-again');
const mBackToLobby = document.getElementById('m-back-to-lobby');
```

Updated `applyState` panel-visibility block:
- `lobby`: `settingsPanel.hidden=false`, `phaseStatus.hidden=true`, `hostPlayArea.hidden=true`
- `playing`: `settingsPanel.hidden=true`, `phaseStatus.hidden=false`, `hostPlayArea.hidden=false`
- `reveal/ended`: `settingsPanel.hidden=true`, `phaseStatus.hidden=true`, `hostPlayArea.hidden=true`

This is the sole controller of `#host-play-area` visibility. play.js never touches the container.

### 4. Restart button wiring

Inside `init()` after item 9 (animation fps):

```js
// 10. Play Again
if (mPlayAgain) {
  mPlayAgain.addEventListener('click', () => {
    getSocket().emit('game:reset');
  });
}

// 11. Back to Lobby
if (mBackToLobby) {
  mBackToLobby.addEventListener('click', () => {
    if (confirm('End this round and return everyone to the lobby?')) {
      getSocket().emit('game:reset');
    }
  });
}
```

Both emit `game:reset`. Confirm dialog guards the mid-round bail-out. Server handler (agent SRV) broadcasts `room:state` (state=lobby) which both scripts receive via their respective `socket.on('room:state', ...)` listeners.

### 5. styles.css additions

Added `v0.4 — HOST-AS-PLAYER AREA` section before the v0.3 reduced-motion block:

- `#host-play-area`: border-top separator, background, padding
- `#host-play-area .play__screen`: unsets `min-height:100dvh` (laptop, not phone), max-width 760px, centered
- `#host-play-area .play__canvas-wrap`: max-width 760px
- `#host-play-area .play__textarea`, `.play__btn`: max-width 760px
- `#host-play-area .play__image`: larger preview (600px × 420px)
- `#m-play-again`: `margin-top: var(--sp-3)`
- `#m-back-to-lobby`: `margin-top: var(--sp-2)`

---

## Acceptance criteria verification (by code trace)

**AC 1: Host sees settings panel in lobby.**
- host.js `applyState` state=lobby branch: `settingsPanel.hidden = false` and `hostPlayArea.hidden = true`. play.js `renderWaiting` returns early. Result: only settings panel shows. PASS.

**AC 2: Host sees write/draw/describe and can submit.**
- On `game:start`, server broadcasts `room:state` (playing) then `phase:assignment` to each player.
- host.js `applyState` playing branch: `hostPlayArea.hidden = false`.
- play.js `socket.on('phase:assignment')`: sets `lastAssignment`, calls `applyState` → routes to `renderWrite`/`renderDraw`/`renderDescribe` (all fully functional, no host guards on these paths).
- Submit flows through `doSubmit` → `emitAck('phase:submit', ...)` — identical to phone player. PASS.

**AC 3: Host submission counts toward round advancement.**
- Host is a full player (joined via `room:join` with `resumePlayerId`). Server's `checkAllSubmitted` counts all players including host. Host's submission via `phase:submit` registers in `currentPhase.submitted`. PASS (no server change needed from HOSTPLAY side).

**AC 4: During reveal, host sees reveal controls; play screens hidden.**
- host.js `applyState` reveal/ended: `hostPlayArea.hidden = true`. play.js `applyState` reveal/ended: `if (isHostPage) return` — no screen changes. album.js/host.js manage `#reveal-panel` as before. PASS.

**AC 5 & 6: Play Again / Back to Lobby → lobby reset.**
- Buttons emit `game:reset`. Server (agent SRV) broadcasts `room:state` (state=lobby).
- host.js `socket.on('room:state', applyState)`: shows settings panel, hides host-play-area and phase-status.
- play.js `socket.on('room:state')`: `state.state === 'lobby'` branch runs: clears `hasSubmitted`, `lastAssignment`, countdown, autoSubmit, removes vote panel.
- All players see lobby; same room code, same QR, no re-join. PASS.

**AC 7: play.html (phones) UNCHANGED.**
- Every host-specific change is behind `if (isHostPage)` guards. When `isHostPage === false` (play.html), code paths are byte-for-byte equivalent to the original. PASS.

**AC 8: No duplicate/ghost host player.**
- play.js calls `room:join` with `resumePlayerId: myPlayerId`. The playerId was already set by host.js's own `room:join`. Server deduplicates by `resumePlayerId` — returns the existing player object, no new slot created. CONTRACT §6 explicitly confirms this. PASS.

**AC 9: No console errors from two scripts coexisting.**
- Both scripts get the socket from `getSocket()` singleton — one connection, one `socket.id`.
- Both register `socket.on('room:state', ...)` — Socket.IO supports multiple listeners; both fire, no error.
- DOM element IDs: host.js refs all exist in the host.html `<main>` tree. play.js refs exist inside `#host-play-area`. Zero ID collision.
- `canvasInstance` in play.js: `initCanvasOnce()` guard prevents double-init; `#draw-canvas` and `#draw-toolbar` are only inside `#host-play-area` (not duplicated elsewhere in host.html). PASS.

---

## Notes / risks

- The double `room:join` (host.js first, play.js second) is deliberate and safe per CONTRACT §6. Both use the same `resumePlayerId`. The second join returns `ok:true` with the same player object. If the server does not return `resp.room` on a resume join, play.js falls back to `showScreen('waiting-screen')` which is a no-op on host page (renderWaiting returns early, and `#host-play-area` is still hidden until `room:state` arrives).

- `#m-play-again` is always visible inside `#reveal-panel` (not behind a separate `hidden` attr). Since `#reveal-panel` visibility is managed by album.js (Agent D owns it), PLAY AGAIN will appear whenever reveal-panel is shown — which is the correct behavior. If there's a desire to hide it during playing state, album.js would need to manage it; but per CONTRACT §3 it belongs in the reveal panel, so this is intentional.

- The spectator screen (between phases on host page, after submitting) shows "Nice work. Waiting on the others..." — correct host experience. Vote panel is NOT shown on host page during reveal (host-play-area hidden), which CONTRACT §2 explicitly allows: "host runs the reveal; players vote from phones."
