# PROJECT AUDIT — KE_GartiK_Phone v0.2

Produced by the project auditor on 2026-05-26. No code was modified.

---

## What Is Working Well (Preserve These)

**Mode-dispatch architecture is solid.** The `server/modes/*.js` strategy pattern is clean, consistent, and extensible. All 10 mode modules implement the full interface (id, displayName, description, revealLayout, supportsManualAdvance, validateStart, initialPhase, nextPhase, buildAlbums, assignmentForPlayer). Adding an eleventh mode requires one file and one line in the registry — exactly right for the pace this project moves.

**The submit pipeline is well-hardened for a party game.** `phase:submit` validates phase name, round number, content type (JPEG prefix + size cap for draw phases, 300-char cap for text), player membership, and duplicate submission. The `submitInFlight` guard in `play.js` prevents UI double-fire. Auto-submit fires at the deadline so nobody gets stuck.

**Reconnect and host-promotion are both wired.** `localStorage` cookie + 30-second grace timer in `game.js` means phone battery deaths recover cleanly. Host promotion fires automatically — there is a UI indicator in `host.js` via the `host__player--host` star marker.

**`serializeRoom` is the single serialization point.** It strips internal state, converts Set → Array, and conditionally includes albums. This eliminates the possibility of leaking timer handles or raw Map objects over the wire.

**The `getSeatOrder` helper is used consistently.** `classic.js`, `story.js`, `animation.js`, `coop.js`, `missingpiece.js`, and `secret.js` all call `getSeatOrder(room)` rather than `room.players` directly. Secret mode's custom ordering works correctly across all phases.

**Idle reaper prevents memory leaks.** The 5-minute interval in `rooms.js` clears rooms with no connected players after 30 minutes of inactivity. Correct for a monthly-use scenario on a free tier with no persistence.

**`canvas.js` is clean and fully self-contained.** The `getDataUrl` function has a four-level quality ladder (0.7 → 0.5 → 0.3 → 360x270 downscale) that keeps outputs under 240KB even on slow phones. Pointer events are used throughout (no mouse + touch duplication).

**`socket-client.js` is minimal and correct.** The singleton socket, `emitAck` with timeout, and URL helpers are solid orchestrator-written infrastructure that all agents correctly imported without modification.

**The smoke test is genuinely useful.** It validates all 10 modes end-to-end (state transitions, revealLayout correctness, no server errors on reveal:next), validates `phase:assignment` fields per CONTRACT_v2 §4, and exits with a non-zero code on failure. It does not test UI rendering, which is correctly documented.

---

## Feature Map

| Mode | Server file | Status | Reveal layout |
|---|---|---|---|
| Classic | modes/classic.js | Full | stepper |
| Knock-Off | modes/knockoff.js | Full | stepper |
| Solo | modes/solo.js | Full (v1 write-phase bug fixed) | gallery |
| Story | modes/story.js | Full | scrollback |
| Animation | modes/animation.js | Full | frame-cycle |
| Co-Op | modes/coop.js | Full | stepper |
| Masterpiece | modes/masterpiece.js | Full (15-min hard cap) | gallery |
| Missing Piece | modes/missingpiece.js | Full (client-side erase) | stepper |
| Background | modes/background.js | Full | gallery |
| Secret | modes/secret.js | Full (custom seat order) | stepper |
| Speedrun | (host UI preset) | Full | n/a |

---

## Risk Register

### HIGH

---

**H-1: `advancePhase` is called from both the timer loop and `checkAllSubmitted`, with no mutex — concurrent calls are possible.**

- **Files**: `server/game.js` lines 54-78 (`startRoomTimer`), lines 295-312 (`checkAllSubmitted`), lines 227-289 (`advancePhase`)
- **Detail**: `startRoomTimer` sets a 1-second interval. `checkAllSubmitted` is called synchronously inside the `phase:submit` handler. Node.js event loop serializes I/O callbacks, so strictly speaking two `setInterval` ticks cannot run concurrently. However, the following sequence is real: the last player submits at time T, `checkAllSubmitted` calls `advancePhase`, which calls `broadcastState` and re-enters `startRoomTimer`. The previous timer was cleared by `clearRoomTimer` at the top of `advancePhase`. So the actual double-advance risk is: the timer fires at T (because `now >= endsAt`), begins `advancePhase`, then before that function returns, the `phase:submit` for the same last player arrives and also calls `checkAllSubmitted`. Because `room.currentPhase` is not cleared until after `broadcastState` inside `advancePhase`, the race window is narrow but not zero in environments with microtask delays. The server would broadcast a new phase, then `advancePhase` would be entered a second time with the now-stale `current` descriptor, potentially calling `mode.nextPhase` on the wrong round.
- **Exploitability**: Requires a player submitting within the same event loop tick as the timer firing. In practice, the 1-second granularity and Node's single-threaded model make this extremely unlikely in normal play. The QC log notes the `submitInFlight` guard prevents client-side double-submit; the server-side race is between the timer and any submit that arrives while the previous `advancePhase` call is executing synchronously (which it does, so no true concurrent execution). **Actual exploitability is LOW**, but the code lacks an explicit guard.
- **Recommendation**: Add a `room._advancing = false` flag. Set it to `true` at the top of `advancePhase` and back to `false` on exit. Check at the top of both `advancePhase` and `checkAllSubmitted`. Also null out `room.currentPhase` at the very beginning of `advancePhase` (before the auto-fill loop) rather than waiting until after `broadcastState`.
- **Effort**: 30 minutes.

---

**H-2: `background.js` mode uses `try { require('../backgrounds') } catch (e) {}` as a bandaid inside a hot path.**

- **File**: `server/modes/background.js` lines 61-68
- **Detail**: The `assignmentForPlayer` function — called once per player per phase — does a `try { require('../backgrounds') }` block. This pattern was written when `backgrounds.js` might not exist yet (Agent G was writing it in parallel). That concern is now resolved: `backgrounds.js` exists and exports `BACKGROUNDS` correctly. The `try/catch` wrapping a `require` inside a per-player hot path is:
  1. A bandaid explicitly left over from the parallel-sprint model
  2. Slightly misleading (the error path silently sends players a blank canvas with no background image, making Background mode functionally wrong)
  3. Marginally slower per call (although Node caches `require`, the try-catch overhead is negligible)
- **Recommendation**: Remove the try/catch. Require `backgrounds` at the top of `background.js` as a module-level import. The same pattern exists in `server/index.js` (line 57 and line 487), where the try/catch around `require('./backgrounds')` in the REST handlers is also no longer needed. Clean all three.
- **Effort**: 15 minutes.

---

**H-3: `joinRoom` allows new players to join a room that is already in `playing` or `reveal` state.**

- **File**: `server/rooms.js` lines 85-118
- **Detail**: `joinRoom` has a branch for reconnecting (existing player) and a branch for new players. The new-player branch only checks `room.players.length >= MAX_PLAYERS`. It does NOT check `room.state`. A player who never joined the original lobby can join a room that is mid-game. They will receive a `room:state` with `state: 'playing'` and no `phase:assignment` (since assignments are only sent to the seat-ordered players at phase start), and they will appear in the player list but never be assigned work. Worse, they will land in `checkAllSubmitted`'s `connectedPlayers(room)` count, potentially blocking auto-advance if the server ever re-calculates connected players after their join.
- **Current protection**: `checkAllSubmitted` only blocks advance if every connected player has submitted. A freshly-joined mid-game interloper who has no assignment would never submit, and the phase timer would have to expire rather than advance early. This is a nuisance for players, not a crash.
- **Recommendation**: Add `if (room.state !== 'lobby') return { ok: false, error: 'GAME_IN_PROGRESS' }` at the top of the new-player branch in `joinRoom`. The reconnect branch (matching `resumePlayerId`) should still be allowed to proceed regardless of state. This blocks uninvited late-joins mid-game and prevents the connected-player count inflation.
- **Effort**: 10 minutes.

---

### MEDIUM

---

**M-1: `_initDrawScreen` re-creates the canvas on every phase transition, reinitializing the toolbar and rebinding the submit button each time.**

- **File**: `public/js/play.js` lines 435-464
- **Detail**: The function checks if `canvasInstance` exists; if it does, it calls `canvasInstance.clear()`, then blanks the toolbar HTML (`toolbarEl.innerHTML = ''`), and re-calls `initCanvas`. This means every draw phase reinstantiates the entire canvas module, rebuilds the toolbar DOM, and adds a new `pointerdown/pointermove/pointerup/pointercancel` listener set to the canvas element. The old listeners are not removed before `initCanvas` is called again. `initCanvas` in `canvas.js` adds new pointer event listeners via `canvasEl.addEventListener(...)` (lines 132-157) without removing old ones. Over the course of a multi-round game a player's canvas element accumulates duplicate event listeners — one for each draw phase they pass through.
- **Risk**: On a 16-player game with Classic mode, a player passes through ~8 draw/describe/draw rounds. By the end, the canvas element has 8 copies of each pointer handler. Each `pointerdown` fires all 8 `beginStroke` calls, creating 8 overlapping canvas paths. This will produce visually corrupted drawing: multiple brush strokes per intended stroke.
- **Recommendation**: Either (a) initialize `canvasInstance` once at page load and expose a `reset()` method that clears the canvas + undo stack without replacing the instance, or (b) add `removeEventListener` calls before re-adding in `initCanvas`. Option (a) is cleaner. The toolbar init (clearing `toolbarEl.innerHTML`) can stay because it doesn't compound.
- **Effort**: 1-2 hours.

---

**M-2: The `phase:assignment` race condition flagged in the v1.1 QC log is a real but deferred issue.**

- **File**: `public/js/play.js` lines 784-791 (`phase:assignment` handler) and lines 135-158 (`doSubmit`)
- **Detail**: When a new `phase:assignment` arrives, the handler sets `hasSubmitted = false` and clears timers. If a `doSubmit` is in-flight (player hit submit at the exact moment the server advanced), the `submitInFlight` flag will prevent a double-submit. However, the `hasSubmitted = false` reset in the assignment handler fires even if the in-flight submit is about to set `hasSubmitted = true`. After the in-flight submit completes, it calls `showScreen('spectator-screen')` and sets `hasSubmitted = true`. But by then the new assignment has already re-routed the UI to the new phase screen, so `showScreen` calls `spectator-screen` on a screen that was just replaced. The player is briefly shown spectator, then immediately re-shown the new phase. This is a flash, not a data corruption issue.
- **Recommendation**: In `doSubmit`'s `finally` block, only call `showScreen('spectator-screen')` if the phase/round of the completed submit still matches `lastAssignment.phase` / `lastAssignment.round`. If a new assignment has arrived in the meantime, skip the screen transition since the new phase renderer already ran.
- **Effort**: 30 minutes.

---

**M-3: Solo and Background modes use `room.players` directly in `buildAlbums` instead of `getSeatOrder`.**

- **Files**: `server/modes/solo.js` line 39, `server/modes/background.js` line 34, `server/modes/masterpiece.js` line 37
- **Detail**: Solo, Background, and Masterpiece don't have a chain to rotate, so `getSeatOrder` doesn't affect album structure — the album is always one slide per player regardless of order. However, if a Secret seat order has been set (e.g., host set Secret mode, then switched to Solo without clearing `room.seatOrder`), the album will reflect `room.players` order rather than seat order. This is a cosmetic inconsistency. More importantly, it differs from the pattern used by all other modes, making it a maintenance trap if these modes are ever extended.
- **Recommendation**: Switch all three `buildAlbums` functions to `const players = getSeatOrder(room)`. The seat order is irrelevant for gallery-layout modes, so this is a no-op change for correctness but improves code uniformity.
- **Effort**: 15 minutes.

---

**M-4: `checkAllSubmitted` compares against `connectedPlayers(room)` but the `submitted` Set counts against ALL players, creating a silent mismatch.**

- **File**: `server/game.js` lines 295-312
- **Detail**: `checkAllSubmitted` does `connected.every(p => submitted.has(p.id))`. This means: if a player disconnects AFTER submitting, their submission still counts but they are removed from the `connected` array. The logic is: connected players who haven't submitted are the only blocker. This is probably the intended behavior. BUT: if a player disconnects BEFORE submitting, they are removed from `connected`, so the block is lifted even though their submission is missing. When `advancePhase` runs, the auto-fill loop creates a blank placeholder for them correctly. So the outcome is correct: the disconnected non-submitter gets a blank placeholder, game continues. The concern is that `checkAllSubmitted` can advance the phase immediately after a disconnect without waiting for the timer, which may feel abrupt if a host expects the timer to count down.
- **Note**: This is actually the desirable behavior (disconnect advances the game). The only issue is this behavior is not documented anywhere visible and could surprise a future dev. Medium priority.
- **Recommendation**: Add a comment in `checkAllSubmitted` explaining the intentional interaction between `connectedPlayers` and missing submissions.
- **Effort**: 5 minutes.

---

**M-5: `album.js` standalone branch joins the room as "Spectator" with a hardcoded emoji `👁️`, which counts toward player slots.**

- **File**: `public/js/album.js` lines 757-763
- **Detail**: The `/album/:code` page calls `room:join` with `{ name: 'Spectator', emoji: '👁️' }`. This creates a new player slot unless `resumePlayerId` matches an existing player. In a 16-player game, a spectator opening the album page would consume the 16th player slot and could trigger the `ROOM_FULL` error for the next legitimate player trying to reconnect. Additionally, the Spectator player appears in the player list on the host page.
- **Recommendation**: Either (a) add a `spectator: true` flag to `room:join` that bypasses the player count cap and excludes the player from phase assignments and `connected` checks, or (b) add a read-only `GET /api/room/:code` REST endpoint that returns the serialized room state without socket join, and use that for the album page instead of a socket join. Option (b) is the cleaner architectural path toward v2 spectator mode.
- **Effort**: Option (a) 1 hour; option (b) 2-3 hours.

---

**M-6: The `knockoff-show` phase uses the same round number as the subsequent `knockoff-draw` phase.**

- **Files**: `server/modes/knockoff.js` lines 43-44 (`nextPhase` returns `{ name: 'knockoff-draw', round }` — same round as `knockoff-show`)
- **Detail**: This is intentional per the v1 QC log ("Agent A: knockoff-show and knockoff-draw share a round number within each pair. Players (Agent C) drive UI off `phase` name, not round, so no client-side action needed"). The issue is on the server side: `advancePhase` auto-fills missing submissions keyed by `(round, playerId)`. When `knockoff-show` ends, it auto-fills a blank for any non-submitted player at that round number. Then `knockoff-draw` uses the same round, so `roundData.get(round)` already has entries for that round from the show phase. The show phase submissions are all blank (since `SKIP_SUBMIT_PHASES` in the smoke test skips them, and players don't submit during knockoff-show — they just watch). This means the existing entries for that round are blanks from auto-fill of the show phase, and the actual `knockoff-draw` submissions are stored at the same round key but overwrite the blanks. Since the show phase doesn't require real content, this works. However it is fragile: if any client somehow emits `phase:submit` during `knockoff-show`, it would write into the same round slot that `knockoff-draw` will also write to.
- **Recommendation**: Assign `knockoff-show` a distinct pseudo-round (e.g., `round + 0.5` as a float, or a separate `_knockoffShowRound` field) so show-phase and draw-phase data are not stored in the same roundData slot. Alternatively, add a phase-name check in `phase:submit` that explicitly rejects submissions during `knockoff-show`.
- **Effort**: 1-2 hours (requires updating smoke test expected behavior).

---

**M-7: `host.js` line-level event listeners are attached at module load time, before `init()` runs.**

- **File**: `public/js/host.js` lines 406-462
- **Detail**: `mMasterPrompt.addEventListener('input', ...)`, `mKnockoffShow.addEventListener('change', ...)`, `mSpeedrunBtn.addEventListener('click', ...)`, `mEndPhaseBtn.addEventListener('click', ...)`, the settings-change listeners, `startGameBtn.addEventListener`, and `skipPhaseBtn.addEventListener` are all wired outside `init()` at the top level of the module. This is fine as long as those DOM elements exist when the module loads — which they do (they are in `host.html`). However, `getSocket()` is called inside these handlers, which is also fine since the singleton initializes lazily. The structural concern is that these listeners are wired before `init()` confirms the user has a valid room. If the redirect in `init()` fires (e.g., no stored playerId), these listeners are dead DOM refs on a page being navigated away from. They cannot cause bugs in that case since the page is unloaded, but it is architecturally inconsistent. In the success path, emitting `room:settings` before `init()` joins the room would silently drop the event (no `ctx` in `socketMap`), which the server handles correctly (no crash).
- **Recommendation**: Move all listener wiring inside `init()` after the `room:join` ACK succeeds. This is a cleanup item, not a bug fix.
- **Effort**: 30-45 minutes.

---

### LOW

---

**L-1: `backgrounds.js` has a dead IIFE comment block at lines 27-29.**

- **File**: `server/backgrounds.js` lines 27-29
- **Detail**: There is an immediately-invoked function expression that contains a comment "Build lines programmatically..." and then does nothing. The actual line-building code follows it in a separate IIFE. This is a leftover from an agent's incremental editing. It evaluates to undefined and is harmless but clutters the file.
- **Effort**: 2 minutes.

---

**L-2: `imageutils.js` is a stub with no content and no documented plan.**

- **File**: `server/imageutils.js`
- **Detail**: The file exports an empty object. It was created by Agent A as a placeholder for future server-side image helpers. It is `require`d by nothing at present. If it is intended for future server-side JPEG processing (thumbnail generation, format conversion), it should document that. If it is not needed for the foreseeable future, it can be deleted.
- **Effort**: 5 minutes (delete or add a comment).

---

**L-3: `play.js` `SCREENS` array at line 40 does not include the new v1.1 phase screens, but this does not cause a bug.**

- **File**: `public/js/play.js` lines 40-47
- **Detail**: The `SCREENS` array used by `showScreen` contains: `waiting-screen`, `write-screen`, `draw-screen`, `describe-screen`, `knockoff-show-screen`, `spectator-screen`. The new v1.1 phase types (`continue`, `coop-draw`, `masterpiece-draw`, `missingpiece-draw`, `background-draw`) all reuse existing screen IDs (`write-screen` for continue, `draw-screen` for all draw variants). This is correct. The `SCREENS` array does not need to be extended. However, it is not documented anywhere why the new phases reuse old screen IDs. A future developer adding a genuinely new screen (e.g., a separate background-draw UI) would need to know to add it here.
- **Recommendation**: Add a comment in `play.js` explaining the screen reuse pattern.
- **Effort**: 5 minutes.

---

**L-4: `play.js` line 783 re-initializes the write input placeholder on every `continue` phase assignment.**

- **File**: `public/js/play.js` line 397
- **Detail**: `renderContinue` sets `input.placeholder = 'Keep the story going...'`. Since `write-screen` is reused, this placeholder leaks into the next `write` phase if the game were somehow re-entered (hypothetical given current flow). Minor cosmetic issue.
- **Effort**: 5 minutes (reset placeholder in `renderWrite`).

---

**L-5: `rooms.js` idle reaper does not cancel `disconnectTimers` for players in reaped rooms.**

- **File**: `server/rooms.js` lines 190-199, cross-reference `server/game.js` line 319 (`disconnectTimers` Map)
- **Detail**: The idle reaper in `rooms.js` deletes the room and calls `clearInterval(room._timer)`. It does not touch the `disconnectTimers` Map in `game.js`. If a room is reaped while a 30-second disconnect timer is pending for a player, that timer will eventually fire, call `getRoom(roomCode)` (returns null), and exit gracefully. No crash, but the timer runs to completion unnecessarily.
- **Effort**: Low priority. The timer self-terminates harmlessly. If desired, the idle reaper could accept a `disconnectTimers` map and cancel timers — but this introduces coupling between `rooms.js` and `game.js` state.

---

**L-6: `host.js` Secret mode drag re-renders the list on every `pointerup`, wiping drag state.**

- **File**: `public/js/host.js` lines 382-393
- **Detail**: `endDrag` calls `renderSecretOrder(players, null)` which calls `attachSecretDrag()` again, adding a new set of pointer event listeners to `mSecretOrder` each time a drag completes. Each re-render adds another `pointerdown`, `pointermove`, `pointerup`, and `pointercancel` listener. Over repeated drags in one session, the listener count grows. The `null` argument to `renderSecretOrder` is intentional (it reads the fresh DOM order). This is the same compound-listener issue as M-1 (canvas), but for a lower-frequency interaction (drag in lobby vs. every draw phase).
- **Recommendation**: Track whether drag listeners are attached with a boolean flag, or remove old listeners before calling `attachSecretDrag`.
- **Effort**: 30 minutes.

---

**L-7: `smoke.js` `validateAssignment` rejects a `deadline` that is "in the past" by more than 1 second, which will flag Masterpiece incorrectly.**

- **File**: `tests/smoke.js` lines 157-163
- **Detail**: The validator checks `if (data.deadline < now - 1000)`. For Masterpiece, `deadline` is `null`, and the validator checks `if (data.deadline !== null && ...)` first — so Masterpiece is correctly skipped. But the comment "Allow 1 second of clock drift" in the validator would flag any phase where network delay + processing time pushes the server-set `endsAt` past 1 second by the time the client receives the assignment. In a slow environment the smoke test could produce false positives. The real Masterpiece-specific check is correct. However, in the masterpiece case, the duplicate handler on `sockA` (line 334) adds a second listener on top of the one already wired at line 321. The first listener emits `phase:submit` with `TINY_JPEG`. The second skips if `masterpieceSkirted` is set. There is a 500ms delay before `phase:skip`. In that 500ms window, the first listener already submitted TINY_JPEG for TestA (drawing phase). This is correct behavior. However, the second (anonymous) listener added at line 334 is never removed from `sockA` — it leaks per iteration but is cleaned up by `disconnectAll`.
- **Effort**: Low priority (test infrastructure only). Document the known listener overlap.

---

## Bandaid Patterns Table

| Pattern | Files | Severity | Origin | Recommended Action |
|---|---|---|---|---|
| `try { require('./backgrounds') } catch (e) {}` in hot path | `server/modes/background.js:61-68`, `server/index.js:57-63`, `server/index.js:484-491` | HIGH | Agent sprint artifact — backgrounds.js might not have existed at time of writing | Remove try/catch; top-level require |
| `Array.isArray(album) ? album : (album.slides || [])` compatibility shim | `public/js/album.js:489` | LOW | v1 QC fix for album shape mismatch — now resolved server-side | Can be simplified to direct array access now that server always sends flat arrays |
| Dead IIFE block in `backgrounds.js` | `server/backgrounds.js:27-29` | LOW | Agent G edit artifact | Delete the empty IIFE |
| `imageutils.js` empty stub | `server/imageutils.js` | LOW | Agent A placeholder for future work | Delete or document intent |
| `host.js` listener wiring outside `init()` | `public/js/host.js:406-462` | MEDIUM | Agent B/E boundary — listeners wired at module-top to avoid scope issues | Move inside `init()` after join ACK |
| Secret order drag re-attaches listeners on every drag end | `public/js/host.js:382-393` | LOW | Agent E did not track listener attachment state | Add attachment guard flag |
| `_initDrawScreen` re-creates canvas and re-adds pointer listeners each phase | `public/js/play.js:435-464` | MEDIUM-HIGH | Agent C: safest approach was re-init; proper fix requires refactoring canvas into a resettable instance | Separate canvas init from canvas reset |

---

## Recommended Implementation Phases

### Phase 0 — Hardening (do before next game night, ~3 hours total)

These fix confirmed bugs or close real risk windows.

1. **Fix `_initDrawScreen` listener accumulation (M-1)**: This is the most impactful bug — it will produce corrupted drawings in multi-round games. Extract canvas pointer listeners into a one-time setup; expose a `reset()` method on `canvasInstance`. Estimated effort: 1-2 hours.

2. **Block mid-game joins for new players (H-3)**: Add `room.state !== 'lobby'` check in `joinRoom` for new-player path. Estimated effort: 10 minutes.

3. **Remove `backgrounds.js` try/catch bandaids (H-2)**: Top-level `require` in `background.js` and clean up the same pattern in `server/index.js`. Estimated effort: 15 minutes.

4. **Add advancePhase guard flag (H-1)**: `room._advancing` boolean. Estimated effort: 30 minutes.

### Phase 1 — Quick Wins (~2 hours total)

These are small fixes with no architectural implications.

1. **Solo/Background/Masterpiece `buildAlbums` use `getSeatOrder` (M-3)**: 15 minutes.
2. **Add comment to `checkAllSubmitted` disconnect behavior (M-4)**: 5 minutes.
3. **Delete dead IIFE and imageutils stub (L-1, L-2)**: 10 minutes.
4. **Add screen-reuse comment in `play.js` (L-3)**: 5 minutes.
5. **Fix `renderContinue` placeholder leak (L-4)**: 5 minutes.
6. **Fix Secret mode drag listener leak (L-6)**: 30 minutes.

### Phase 2 — Structural (before v2 feature work, ~1 day)

These should be done before adding features that rely on the affected systems.

1. **Spectator join model (M-5)**: Add `spectator` flag to `room:join` or add a `/api/room/:code` REST endpoint. This is the architectural prerequisite for v2 spectator links and persistent album viewing. Estimated effort: 2-3 hours.

2. **Move `host.js` listeners inside `init()` (M-7)**: Structural cleanup, reduces risk of future init-order bugs. Estimated effort: 45 minutes.

3. **`phase:assignment` race fix in `play.js` (M-2)**: Match-phase check before `showScreen` in `doSubmit` finally block. Estimated effort: 30 minutes.

4. **Knockoff round number disambiguation (M-6)**: Give `knockoff-show` a distinct round key in `_roundData`. Estimated effort: 1-2 hours including smoke test update.

### Phase 3 — Features (v2 additions)

The current architecture accommodates these features with the following notes:

| v2 Feature | Readiness | Notes |
|---|---|---|
| Voting on funniest album | Ready | Add `reveal:vote` event. Server tallies per-album votes. Needs a UI phase after `state: 'ended'`. No structural changes. |
| Album download / ZIP | Ready | Client-side: canvas + libraries render album to PNG strip in the browser. No server changes needed. |
| Custom prompt decks | Ready | Add `room:prompts { deck: [string] }` event. Server stores `room._customPrompts`. Modes that use prompts check this first. |
| Sound effects | Ready | Client-side Tone.js or Web Audio API. Zero server impact. |
| Kick player (host) | Ready | Add `room:kick { playerId }` event. Server calls `removePlayer` after validating host. |
| Animation framerate config | Ready | Expose in host UI as a number input; store in `room.settings.animationFps`; emit in `reveal:album`. 1 hour. |
| Spectator link | Needs Phase 2 M-5 first | See above — needs either a flag-based or REST-based spectator join. |
| Album persistence | Structural change | Requires a database. Recommend SQLite (better-sqlite3) for simplicity. The `serializeRoom` output is the natural insert payload. Albums are the main thing to persist; room metadata and player lists are transient. Estimated: 1 day for storage; another 0.5 day for a `/past-games` route and UI. |

---

## Open Questions

1. **Does `knockoff-show` need its own round number?** The current shared-round behavior works but is fragile. If any future change causes auto-fill to run before the draw phase, the show-phase blanks would block draw-phase data. Decision: fix it (M-6) or document that the show phase must never have real submissions.

2. **Should the spectator/album page join the Socket.io room at all?** Currently it does a full `room:join`, consuming a player slot and appearing in the player list. A REST endpoint for state retrieval + separate Socket.io subscription to a read-only room channel would be cleaner and is the path to v2 spectator links.

3. **Render cold-start UX**: 30-second cold starts on the free tier are documented in README. Is there a pre-warm script or calendar reminder built into game-night prep? If game nights grow beyond monthly, a $7/month Render Starter plan eliminates this concern entirely.

4. **Animation mode with 2 players**: With N=2, Animation has only 1 frame (rounds: write at 0, draw at 1). The frame-cycle at 1fps is just a static image. Should `animation.js` `validateStart` require >=3 players for a meaningful animation?

5. **What happens to a Masterpiece game if no players submit before the 15-minute hard cap?** They all get blank canvases. `buildAlbums` returns an album of blank-content slides, which the gallery will display as `[blank]` tiles. This is technically correct but visually unsatisfying. Consider a minimum of 1 submitted drawing before the hard cap fires, or display a message in the gallery for blank tiles.

---

## Bottom Line

KE_GartiK_Phone v0.2 is well-architected for its purpose. The mode-dispatch pattern, the shared seat-order abstraction, the reconnect/promotion logic, and the submit pipeline are all clean and correct. The project handles its stated scope (10 modes, 16 players, monthly scheduled event, free hosting) without significant reliability risk.

The most pressing bug before the next game night is the `_initDrawScreen` listener accumulation (M-1): in a multi-round game with Classic or Co-Op, each draw phase adds a duplicate pointer handler to the canvas, and by round 5 or 6 every stroke will draw 5-6 overlapping paths. This produces noticeably corrupted drawings and will confuse players. It requires a 1-2 hour refactor of canvas initialization in `play.js`.

The second-priority concern before adding v2 features is the spectator join model (M-5). The `/album/:code` page currently consumes a player slot and appears in the host's player list, which will become increasingly awkward as features like persistent album links, voting, and spectator-only access are added. Addressing this before v2 keeps the architecture clean.

Everything else in this audit is either low-impact cosmetic cleanup (the bandaid remnants from the sprint model) or medium-priority structural improvements that can be done incrementally without blocking game nights.
