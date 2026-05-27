# QC Integration Log — v0.4

Two features requested by Kons after first live testing: (1) host can't play from the host screen (computer was controller-only), (2) no way to restart a game without everyone re-joining.

## Built (2 parallel agents + QC verifier + orchestrator fixes)

**SRV agent** — `game:reset` server event:
- Host-only, valid in playing/reveal/ended. Returns room to lobby keeping players, code, hostId, seatOrder, settings, masterprompt, backgroundId, customPrompts. Clears currentPhase, albums, votes, revealCursor, revealLayout, _roundData, _advancing, timers.
- `resetRoomToLobby(room)` helper in rooms.js.
- After reset, existing `game:start` works (requires lobby state).

**HOSTPLAY agent** — host-as-player + restart UI:
- host.html gains `#host-play-area` with the full set of player screens (copied from play.html), plus canvas.js + play.js script tags.
- play.js gains an `isHostPage` guard: no redirect, no waiting-screen during lobby, but full write/draw/describe participation during playing. Phone (play.html) behavior unchanged — every divergence is behind `isHostPage`.
- host.js shows `#host-play-area` only during 'playing'; settings panel in lobby; reveal panel during reveal/ended. Clean visibility partition: host.js owns the container + control panels, play.js owns the screens inside.
- Restart buttons: `#m-play-again` (in reveal panel) and `#m-back-to-lobby` (in phase-status, with confirm) both emit `game:reset`.

## QC verifier result
All v0.4 acceptance criteria PASS. No-ghost-player confirmed (host.js + play.js share the singleton socket; second room:join is a harmless resume). No element-visibility war.

## Orchestrator fixes after QC

1. **Voting was broken on phones (pre-existing bug, fixed here):** `buildVotePanel` in play.js read `album.slides`, but the server sends each album as a flat array. Result: every player saw "No slides to vote on". Fixed to treat album as a flat array (with `{slides:[]}` fallback for forward-compat). Voting now works.

2. **Cosmetic:** host-page `#waiting-screen` lacked a `hidden` attribute, causing a brief flash between game start and first phase assignment. Added `hidden`.

## Known non-blocking notes
- Auto-deploy is not wired (public-repo Render path), so v0.4 needs a manual push + Render sync.
- During reveal, the host votes via the reveal panel context only; host-play-area (with the phone-style vote panel) is hidden on the host page. Acceptable — players vote from phones, host runs the reveal.

## Files touched
- server/game.js, server/rooms.js (reset)
- public/host.html, public/js/host.js, public/js/play.js, public/css/styles.css (host-as-player + restart)
- public/js/play.js (vote-panel flat-array fix)
- package.json → 0.4.0
