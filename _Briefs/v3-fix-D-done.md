# FIX-D Completion Note — album.js REST refactor

Agent: FIX-D
Date: 2026-05-26
File edited: `public/js/album.js` (standalone branch only)

---

## M-5: Album standalone page uses REST instead of Socket.io join

**Done.** The `emitAck('room:join', { name: 'Spectator', emoji: '👁️', ... })` block and the `socket.on('room:state', applyState)` live-update listener have been removed from the album standalone branch entirely.

Replaced with:
- `async function fetchRoomState(code)` — calls `GET /api/room/:code`, handles 404, non-ok status, and `data.ok === false` error shapes. Throws descriptive errors in all cases.
- Initial call to `fetchAndApply()` (which calls `fetchRoomState` then `applyState`) on page load.

The socket is no longer imported or called in the standalone branch. The import line was trimmed to only `{ getSocket, getRoomCodeFromPath }` — `getSocket` is still imported for the host branch above; `emitAck`, `getStoredPlayerId`, and `setStoredPlayerId` were removed since the standalone branch no longer needs them.

**Graceful handling if FIX-A endpoint is not yet deployed:** 404 → "Room not found", other non-ok statuses → "Server returned N". Error banner shown; polling continues every 30s.

---

## Auto-refresh implementation

**Done.** `setInterval(fetchAndApply, 30_000)` starts after the initial fetch. Interval handle stored in `_refreshInterval`.

Behaviour:
- On load: fetch + `applyState`
- Every 30s: re-fetch + `applyState`
- If `room.state` is not `reveal` or `ended`, `setNotReady('Game not finished yet — checking again in 30s...')` overrides the default "Game is not finished yet" message with the polling hint.
- If any fetch throws: `showErrorBanner(...)` renders a red banner at the top of `#album-root` with the error message + "Retrying in 30s...". Banner hides on next successful fetch.
- `beforeunload`: clears both `_standaloneCycleInterval` and `_refreshInterval`.

---

## Download-as-PNG implementation

**Done.** A "DOWNLOAD ALBUM AS PNG" button is injected at the top of `#album-root` on page load (hidden until albums are available). Hidden state is toggled in `fetchAndApply` once `albums.length > 0`.

Canvas composition:
- Strip width: 480px
- Drawing slides: 480 × 360 (4:3 preserving 720×540 source aspect ratio)
- Text slides: 480 × 200 with 24px sans-serif, word-wrapped at word boundaries to fit 448px (480 − 2×16 padding)
- Author label: 32px strip below each slide (`#2a2a40` background, `#c0c0d8` text)
- Gap between slides: 20px
- Background fill: `#1a1a2e`
- Drawing images pre-loaded via `Promise`-based `loadImage()` helper; failed loads render a `#333355` blank rect
- Export via `canvas.toBlob() → URL.createObjectURL → <a download>` then revoked

`currentAlbum` state variable (declared at top of `isAlbumPage` block) always holds the album entry at the current `albumCursor`. Updated in `fetchAndApply` (after `applyState` so `albumCursor` is final) and in the `albumNext`/`albumPrev` click handlers via `syncCurrentAlbum()`.

---

## Host branch

Untouched. All socket listeners, `reveal:slide`, `reveal:album`, `reveal:next`/`reveal:prev` button wiring, and keyboard navigation remain exactly as before.

---

## Open questions for FEAT-ALB (Pass 2 — vote tallies on slides)

1. **Vote tally data shape**: CONTRACT_v3 §3 describes `vote:tally` as a separate socket event with `{ tallies, myVote }`. Since the standalone album page now has NO socket connection, FEAT-ALB will need to either (a) render vote tallies from the REST response (`room.votes` per §4) or (b) add a separate REST polling endpoint. Option (a) is the path of least resistance — the auto-refresh already polls the full room state every 30s, which will include `room.votes` once FEAT-SRV implements it. FEAT-ALB should read `state.votes` in `applyState` and annotate slides accordingly.

2. **Per-slide vs per-album vote display**: CONTRACT_v3 §6 says the "winner" is the slide with the highest count within an album. FEAT-ALB needs to decide whether to show counts on every slide or only highlight the winner. Suggest: show counts on all slides, bold/highlight the winner.

3. **Download button and vote tallies**: Should the PNG strip include vote count annotations? The current implementation doesn't. If yes, FEAT-ALB should extend `downloadAlbumStrip` to read `currentAlbum`'s vote data and render count badges on each slide. The `currentAlbum` variable and the `downloadAlbumStrip` function are already in scope inside `isAlbumPage`; FEAT-ALB can extend them directly.

4. **`currentAlbum` shape**: Currently set to the raw album array entry from `state.albums[albumCursor]`. If FEAT-ALB changes the album shape on the server (e.g., adding a `votes` subfield to each album), `getSlidesArr(currentAlbum)` will still work as long as the flat array or `.slides` array is preserved.

5. **Spectators cannot vote per CONTRACT_v3 §6**: The standalone page has no socket and no `playerId`, so voting UI should be read-only (tallies visible, no vote button). FEAT-ALB should not add a `reveal:vote` emit path to this page.
