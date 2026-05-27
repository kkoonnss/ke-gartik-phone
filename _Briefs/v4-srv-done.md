# v4-srv-done.md — SRV agent completion report

## What changed

### server/rooms.js
- Added `resetRoomToLobby(room)` helper function (placed above the idle reaper, below `promoteNextHost`).
- Exported `resetRoomToLobby` from the module.

### server/game.js
- Added `resetRoomToLobby` to the `require('./rooms')` destructure.
- Added `game:reset` socket handler between `game:start` and `phase:submit`.

No other files were touched.

---

## Exact field-reset list (what resetRoomToLobby sets)

| Field | Value after reset |
|---|---|
| `room.state` | `'lobby'` |
| `room.currentPhase` | `null` |
| `room.albums` | `[]` |
| `room.revealCursor` | `null` |
| `room.revealLayout` | `null` |
| `room.votes` | `null` |
| `room._roundData` | `new Map()` |
| `room._totalRounds` | `undefined` |
| `room._soloPrompt` | `undefined` |
| `room._phaseStartedAt` | `undefined` |
| `room._advancing` | `false` |
| `room.lastActivityAt` | `Date.now()` |
| `room._timer` | cleared by `clearRoomTimer` in the handler before `resetRoomToLobby` is called |

### Fields explicitly KEPT (not touched)
`players`, `code`, `hostId`, `seatOrder`, `settings`, `masterprompt`, `backgroundId`, `customPrompts`, `createdAt`, `_joinUrl`

---

## serializeRoom safety

`serializeRoom` checks `room.votes ? { perAlbum: ... } : null` — `null` is safe.  
`room.currentPhase` is checked as `room.currentPhase ? { ... } : null` — `null` is safe.  
`room.albums` is only appended to the snapshot when `state === 'reveal' || state === 'ended'` — after reset state is `'lobby'` so albums are not serialized, and the `[]` value is never exposed.

---

## Manual test (3 steps)

1. Open the host page, add 2+ players from phones, start a game, and let it reach the reveal/ended state. Open the browser console on the host page, run `socket.emit('game:reset')`. All connected clients (host + phones) should immediately return to the lobby/waiting view with the same room code.

2. After the reset, verify the host can start a new game: pick a mode on the settings panel and press START. The game should begin normally from round 1.

3. Start a game, let it reach the `playing` state (mid-round), then emit `game:reset` from the host. The timer should stop, all clients should see the lobby, and no ghost phases or lingering countdown should appear on any screen.

---

## Nothing felt wrong — implementation is clean.
