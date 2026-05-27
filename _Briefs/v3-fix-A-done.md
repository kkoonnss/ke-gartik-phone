# FIX-A Completion Note — v3 Server Hardening + REST Endpoint

Agent: FIX-A
Date: 2026-05-26

---

## Files Modified

1. `server/game.js` — mutex, knockout guard, new event handlers, fps fix, BACKGROUNDS import
2. `server/rooms.js` — GAME_IN_PROGRESS block, new v3 fields in createRoom + serializeRoom
3. `server/index.js` — BACKGROUNDS top-level require, clean /api/backgrounds, new /api/room/:code
4. `server/backgrounds.js` — dead IIFE removed (L-1)
5. `server/modes/background.js` — getSeatOrder in buildAlbums, top-level BACKGROUNDS require, no try/catch
6. `server/modes/solo.js` — getSeatOrder in buildAlbums, customPrompts support, getSeatOrder import
7. `server/modes/masterpiece.js` — getSeatOrder in buildAlbums, customPrompts support, imports added

**NOT deleted:** `server/imageutils.js` — bash workspace was unavailable (Google Drive mount issue). File already has a clear "stub, reserved for future use" comment. It is unrequired by anything; safe to delete manually with `del server\imageutils.js`.

---

## Audit Finding Status

| ID | Title | Status |
|---|---|---|
| H-1 | advancePhase mutex | FIXED — `room._advancing` flag guards both `advancePhase` and `checkAllSubmitted`; `currentPhase` nulled before auto-fill loop |
| H-2 | Remove backgrounds.js try/catch bandaid | FIXED — Top-level `require('./backgrounds')` in `background.js` and `index.js`; `game.js` also uses top-level import for the `room:background` handler. All three try/catch sites cleaned |
| H-3 | Block mid-game joins | FIXED — `joinRoom` returns `{ ok: false, error: 'GAME_IN_PROGRESS' }` if `room.state !== 'lobby'` for new-player path; reconnect path unaffected |
| M-3 | getSeatOrder consistency | FIXED — `solo.js`, `background.js`, `masterpiece.js` buildAlbums all use `getSeatOrder(room)` |
| M-4 | Document checkAllSubmitted disconnect behavior | FIXED — Multi-line comment added in `checkAllSubmitted` explaining intentional disconnect behavior |
| M-5 | Spectator REST endpoint | FIXED — `GET /api/room/:code` added to `server/index.js`; uses `getRoom` + `serializeRoom` from `./rooms` |
| M-6 | Knockoff round disambiguation | FIXED — `phase:submit` handler rejects `phase === 'knockoff-show'` with `VALIDATION: 'No submission allowed for knockoff-show phase'` |
| L-1 | Dead IIFE in backgrounds.js | FIXED — Empty `(function () { ... })()` block at lines 27-29 removed |
| L-2 | Delete imageutils.js stub | DEFERRED — bash workspace unavailable; file unchanged but harmless; delete manually |

---

## New v2 Event Handlers Added

All four handlers are in `server/game.js` inside `attachGame`, wired before the `disconnect` handler:

| Event | Auth | State Guard | Action |
|---|---|---|---|
| `reveal:vote` | any player | `reveal` or `ended` only | Validates albumIdx/slideIdx bounds; records in `room.votes.perPlayer`; increments/swaps `room.votes.perAlbum` tallies; emits `vote:tally` per-socket with individual `myVote` field |
| `room:prompts` | host only | lobby only | Validates array ≤100 entries, each ≤300 chars; stores in `room.customPrompts`; empty array clears |
| `room:kick` | host only | any state | Validates target exists and is not self; emits `kicked` to target socket; setTimeout 200ms then disconnect; calls `removePlayer`; broadcasts state |
| `room:animation-fps` | host only | lobby only | Clamps to 1-12; stores in `room.settings.animationFps`; broadcasts state |

---

## New Fields in serializeRoom

| Field | Source | Notes |
|---|---|---|
| `customPrompts` | `room.customPrompts` | null when unset; array when custom deck loaded |
| `votes` | `room.votes.perAlbum` (public portion only) | perPlayer omitted from global broadcast; per-player myVote delivered only via per-socket `vote:tally` events |
| `settings.animationFps` | `room.settings.animationFps` | Included in `settings` spread; default 3 (set in createRoom) |

---

## Animation FPS Change (item 11)

`buildRevealAlbumPayload` in `game.js` was changed from hardcoded `payload.fps = 3` to `payload.fps = room.settings.animationFps || 3`. Default `animationFps: 3` added to `createRoom` settings. Also reset in `game:start` handler.

---

## Custom Prompt Support (item 12)

- `solo.js`: Added `pickPromptFor(room)` helper. Uses `room.customPrompts` deck if non-empty, else falls back to `PROMPTS`. Called in `initialPhase`.
- `masterpiece.js`: Added `pickPromptFor(room)` helper. Uses `room.customPrompts` deck if non-empty, else `MASTERPIECE_PROMPTS`. Called in `buildAlbums` and `assignmentForPlayer` as the fallback when `room.masterprompt` is not set.

---

## Manual Test Steps

### Server start
```
cd /d "C:\Users\Kons\Documents\_KE_VibeApps\KE_GartiK_Phone"
node server/index.js
```

### Smoke test (all 10 modes)
```
cd /d "C:\Users\Kons\Documents\_KE_VibeApps\KE_GartiK_Phone"
node tests/smoke.js
```
Expected: 10/10 PASSED

### H-1 — no double-advance
Start a game with 2 players. Have them both submit simultaneously from two browser tabs. Verify the game advances exactly once and not twice.

### H-2 — backgrounds endpoint
`curl http://localhost:3000/api/backgrounds`
Should return JSON with 8 backgrounds, no errors.

### H-3 — block mid-game join
Start a game. From a third browser tab, try to join with a new name. Should see "GAME_IN_PROGRESS" error. Original players should be unaffected.

### M-5 — REST endpoint
```
curl http://localhost:3000/api/room/XXXX
```
With a valid room code: returns `{ ok: true, room: {...} }`.
With an invalid code: returns 404 `{ ok: false, error: 'ROOM_NOT_FOUND' }`.

### reveal:vote
During reveal state, emit `reveal:vote { albumIdx: 0, slideIdx: 0 }` from a socket. Each connected socket should receive `vote:tally` with `myVote` populated for the voting player and `null` for others.

### room:kick
As host, emit `room:kick { playerId: 'p_...' }` targeting a non-host player. Target should receive `kicked { reason: '...' }`. After 200ms, target is disconnected. Host and other players receive updated `room:state` without the kicked player.

### room:animation-fps
As host in lobby with mode=animation, emit `room:animation-fps { fps: 6 }`. `room:state` should show `settings.animationFps: 6`. Run to reveal; the `reveal:album` payload should have `fps: 6`.

### room:prompts
As host in lobby, emit `room:prompts { prompts: ['Test prompt A', 'Test prompt B'] }`. `room:state` should show `customPrompts: ['Test prompt A', 'Test prompt B']`. Start solo mode game — prompt should come from the custom deck.

---

## Known Issues / Stoppers

None. All changes are additive to existing v1/v2 contract. Backward compatibility maintained.

The only deferred item is L-2 (imageutils.js deletion) due to bash workspace being down. No functional impact.
