# QC Integration Log

Orchestrator pass after the six parallel sub-agents finished. Each fix below was applied by reading both ends of an integration point and patching the one that diverged from the contract.

## Bugs found and fixed

### 1. QR endpoint response shape mismatch
- **Server (Agent A)** returns `{ dataUrl }`.
- **host.js (Agent B)** was reading `data.dataUri` / `data.svg`, missing the actual field.
- **Fix:** `public/js/host.js` — updated to prefer `data.dataUrl` (with `dataUri` retained as a backstop).

### 2. Album shape mismatch in album viewer
- **Server (Agent A)** stores `room.albums[j]` as a flat array of slides (`[slide0, slide1, ...]`).
- **album.js (Agent D)** assumed `{ slides: [...] }` envelope.
- **Fix:** `public/js/album.js` — `buildFlatList` and `showCurrent` now accept either shape via `Array.isArray(album) ? album : (album.slides || [])`.

### 3. Solo mode lost all drawings on reveal
- **buildAlbums solo branch** read from `room._slideData` (never populated).
- **phase:submit** writes to `room._roundData`.
- **Fix:** `server/game.js` — solo album builder now reads from `_roundData.get(1)` (the draw round).

## Items flagged by agents and acceptable as-is

- **Agent A:** knockoff-show and knockoff-draw share a round number within each pair. Players (Agent C) drive UI off `phase` name, not round, so no client-side action needed.
- **Agent B:** `#submitted-count` shows total players rather than connected players. Acceptable for v1.
- **Agent E:** `--accent` finalized at `#FFD400` (yellow) and `--accent-2` at `#FF2E63` (hot pink). Toolbar is sticky-bottom on narrow screens.
- **Agent F:** Confirmed `/health` returns HTTP 200 and `PORT` env is honored in server/index.js.

## Open items deferred to v1.1

- Solo mode currently runs a wasted `write` phase before `draw`; the contract describes solo as draw-only. Cleanup would simplify the player UX. Functionally playable as-is — the write phase just isn't used in the album.
- `knockoffShowSeconds` not exposed in the host settings UI. Server uses default 8s.
- Reveal on standalone album page does not auto-poll `room:state`; refresh re-syncs.

## Files touched in QC

- `public/js/host.js`
- `public/js/album.js`
- `server/game.js`
