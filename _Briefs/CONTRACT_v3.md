# CONTRACT_v3.md — v2 Feature Additions (Locked)

**This is the v3 contract. It supersedes v2 but is BACKWARD-COMPATIBLE: all v1/v2 events still work. New fields and events are additive.**

This contract covers two things:
1. The fix-pass cleanup that targets specific audit risks (M-1, M-5, etc.).
2. The new v2 features: voting/reactions, album download, custom prompt decks, sound effects, host moderation (kick), animation framerate config, spectator REST endpoint.

If you are a sub-agent reading this: do NOT invent events. If a contract change feels required, stop and report it to the orchestrator.

---

## 1. New REST Endpoints

### `GET /api/room/:code`
Returns the serialized room state WITHOUT requiring a Socket.io join. Used by the standalone `/album/:code` page to view a finished game without consuming a player slot.

Response:
```js
{ ok: true, room: <serializeRoom output> }
// or
{ ok: false, error: 'ROOM_NOT_FOUND' }
```

If room is in `lobby` or `playing` state, the response still returns but the `albums` field will be absent (as per current `serializeRoom` behavior). Album page handles this by showing "Game not finished yet".

### `GET /api/room/:code/album.zip` (optional, future)
NOT in scope for this sprint. Album download is implemented client-side via canvas composition.

---

## 2. New Client → Server Events

### `reveal:vote` (any player or spectator)
Submitted during reveal. Each player can vote ONCE per album, for the "funniest slide" within that album.
```js
{ albumIdx: 2, slideIdx: 4 }
```
- Server validates the room is in `reveal` or `ended` state.
- Server validates albumIdx and slideIdx are within bounds.
- A player can change their vote within the same album by submitting a new `reveal:vote` (the previous vote is overwritten).
- Server tallies and includes vote totals in `room:state` (see §4).

### `room:prompts` (host only, lobby only)
Sets a custom prompt deck that replaces the built-in prompts for modes that use them (Solo, Story optional, Masterpiece fallback, etc.).
```js
{ prompts: ['A motion designer', 'A keyframe', ...] }
```
- Max 100 prompts per deck.
- Max 300 chars per prompt.
- Empty array clears custom prompts and reverts to built-in deck.

### `room:kick` (host only)
Removes a player from the room mid-game or in lobby. Host cannot kick themselves.
```js
{ playerId: 'p_abc' }
```
- Server validates host and target exists.
- Server emits a `kicked` event to the target socket before disconnecting them.
- Server removes the player from the room, broadcasts state.

### `room:animation-fps` (host only, lobby only)
Configures the animation reveal cycle rate (default 3 fps; range 1-12).
```js
{ fps: 5 }
```
Stored in `room.settings.animationFps`.

---

## 3. New Server → Client Events

### `kicked`
Sent to a player just before the server disconnects them.
```js
{ reason: 'Host removed you from the room' }
```
Client displays a banner and navigates to `/`.

### `vote:tally` (broadcast)
Sent after each `reveal:vote` is processed. Contains current tallies for ALL albums.
```js
{
  tallies: [
    { albumIdx: 0, votes: [ { slideIdx: 0, count: 0 }, { slideIdx: 1, count: 3 }, ... ] },
    ...
  ],
  myVote: { albumIdx: 2, slideIdx: 4 } | null   // per-recipient — what THIS socket voted
}
```
Sent as part of `room:state` (see §4) AND emitted independently after each new vote so clients don't have to wait for the next state broadcast.

---

## 4. `room:state` Additions

```js
{
  // ... existing v1/v2 fields ...
  customPrompts: ['...', ...] | null,       // NEW. Set by room:prompts.
  votes: {                                   // NEW. Populated during reveal/ended.
    perAlbum: [
      { albumIdx, totals: [ { slideIdx, count } ] }
    ],
    perPlayer: { [playerId]: { albumIdx, slideIdx } }   // who voted for what
  } | null,
  settings: {
    // ... existing ...
    animationFps: 3,                         // NEW. Default 3, range 1-12.
  }
}
```

---

## 5. File Ownership for v2 Sprint

### Pass 1 — Bug Fixes (parallel, 4 agents)

| Agent | Owns |
|---|---|
| FIX-A: Server hardening + REST | `server/game.js`, `server/rooms.js`, `server/index.js`, `server/modes/*.js`, `server/backgrounds.js`, `server/imageutils.js` |
| FIX-B: Canvas + play.js refactor | `public/js/canvas.js`, `public/js/play.js` |
| FIX-C: Host.js polish | `public/js/host.js` |
| FIX-D: Album.js refactor for REST endpoint | `public/js/album.js` |

### Pass 2 — v2 Features (parallel, 5 agents)

| Agent | Owns |
|---|---|
| FEAT-SRV: Server features | `server/game.js` (add new events + state fields), `server/rooms.js` (extend serializeRoom + storage), `server/modes/animation.js` (use settings.animationFps) |
| FEAT-HOST: Host UI features | `public/js/host.js` + `public/host.html` (additive: vote tally display, custom prompts textarea, kick buttons next to player names, framerate slider) |
| FEAT-PLAY: Player UI features | `public/js/play.js` (vote buttons during reveal, sound triggers, "you've been kicked" banner) |
| FEAT-ALB: Album.js features | `public/js/album.js` (vote tallies on slides, "Download this album as PNG strip" button) |
| FEAT-SND-CSS: Sound + theming | `public/js/sounds.js` (new), `public/css/styles.css` (additive), `public/css/theme.css` (light additions) |

**Shared / pre-written / do not edit:**
- All four HTML files except `host.html` (FEAT-HOST may add new elements inside existing panels following `#m-*` naming)
- `public/js/socket-client.js`
- `CONTRACT.md`, `CONTRACT_v2.md`, `CONTRACT_v3.md`

---

## 6. Vote Tallying Rules

- Each player gets ONE vote per album.
- Players can vote during `reveal` state or `ended` state (allowing late votes after host advances to ended).
- A player's most recent vote OVERWRITES any prior vote for that album.
- Spectators (via REST endpoint, not socket-joined) cannot vote.
- The "winner" of an album is the slide with the highest count. Ties are not resolved (UI shows them all).
- After the host clicks the final reveal:next (state → ended), the host UI displays a "winners gallery" showing the top-voted slide per album.

---

## 7. Sound Effects (Tone.js)

A small client-side module `public/js/sounds.js` exports:
- `playPhaseStart()` — short rising chime
- `playPhaseEnd()` — descending tone
- `playSubmit()` — confirm click
- `playReveal()` — fanfare sting (3-note ascending)
- `playVote()` — soft pop
- `playKicked()` — descending sad-trombone (2 tones)
- `init()` — must be called inside a user gesture (mobile audio policy); fired on first click

Sounds are OPT-IN. The user has a "Sound: on / off" toggle on the lobby page and player page. Default OFF (per memory: don't be intrusive). Setting persists via `localStorage`.

Tone.js loaded from CDN: `https://cdnjs.cloudflare.com/ajax/libs/tone/14.7.77/Tone.js` (or pin a known version). If load fails, all sound functions become no-ops.

---

## 8. Album Download Format

The "Download Album" button on the album page composes the slides into a single PNG strip:
- Each slide is rendered to a temporary canvas at 480px wide (preserving aspect for drawings, wrapping text for text slides)
- Slides are stacked vertically with author labels
- Final composed canvas is exported as PNG via `canvas.toBlob()`
- File saved via temporary `<a download="...">` link

Implementation is entirely client-side. No server endpoint needed.

---

## 9. Custom Prompt Decks

Host can paste prompts in a textarea (`#m-custom-prompts`) on the host page. One prompt per line. Server stores `room.customPrompts` as an array.

Modes that consume prompts (Solo, optionally Masterpiece) check `room.customPrompts` first; if non-empty, they pick from there. Otherwise, fall back to built-in `PROMPTS` from `server/prompts.js`.

---

## 10. Host Kick UI

In the host's player list, each non-host player gets a small `×` button next to their name. Clicking it emits `room:kick { playerId }`. The host gets a confirmation dialog (`confirm("Kick {name}?")`) before sending.

After kick:
- Target player sees a full-screen banner: "You've been kicked by the host" + 5-second countdown then redirect to `/`
- All other players see the player list update
- Game continues (no special handling for mid-game kicks; the kicked player's submissions remain in the album)

---

## 11. Animation Framerate Config

Host has a new number input `#m-animation-fps` visible only when mode=animation. Default 3, min 1, max 12. Emits `room:animation-fps { fps }` on change.

Server stores in `room.settings.animationFps`. The animation reveal `reveal:album` payload uses this value for the `fps` field.

Album.js reveal-cycle renderer reads `payload.fps` (already implemented) — no client change needed besides the host UI.

---

## 12. Tech Notes

- Server still CommonJS Node 20.
- Frontend vanilla ES modules.
- Tone.js loaded from CDN inside `sounds.js`; if loading fails, all sound calls become no-ops.
- All new fields are additive in `room:state`. Old clients (v0.1, v0.2) connecting to v0.3 server still work.

---

## 13. Validation Caps

| Field | Cap |
|---|---|
| `customPrompts` length | 100 entries max |
| `customPrompts[i]` length | 300 chars |
| `animationFps` | 1-12 |
| Vote `albumIdx` | must be valid index |
| Vote `slideIdx` | must be within album length |

---

## 14. Bug Fix Requirements (per Audit)

Each Pass-1 agent applies the specific audit fixes listed in their brief. The audit at `_Briefs/PROJECT_AUDIT.md` is the authoritative source. Key bugs to fix:

- **M-1**: canvas pointer listener accumulation (FIX-B)
- **H-1**: advancePhase mutex flag (FIX-A)
- **H-2**: remove backgrounds.js try/catch bandaid (FIX-A)
- **H-3**: block mid-game joins (FIX-A)
- **M-3**: Solo/Background/Masterpiece use getSeatOrder (FIX-A)
- **M-5**: spectator REST endpoint (FIX-A) + album.js switches to REST-based read (FIX-D)
- **M-6**: knockoff round disambiguation (FIX-A)
- **M-7**: host.js listeners inside init() (FIX-C)
- **L-1, L-2**: dead IIFE + imageutils stub cleanup (FIX-A)
- **L-6**: secret drag listener leak (FIX-C)
- **M-2**: phase:assignment race spectator-screen flash (FIX-B)
- **L-3, L-4**: comments + placeholder leak (FIX-B)

If anything in this contract feels wrong while you're building, **stop and report**. Do not silently diverge.
