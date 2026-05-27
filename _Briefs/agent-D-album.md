# Agent D — Album Reveal Player

## Your scope
Build the album playback experience for both the host control panel (drives the room-wide reveal) and the standalone `album.html` page (replays the most recently completed game's albums).

## Files you own (write ONLY these)
- `public/js/album.js`

This file is included by BOTH `host.html` and `album.html`. Detect which page you're on and behave accordingly.

## Required reading
- `_Briefs/CONTRACT.md` — `reveal:slide`, `reveal:next`, `reveal:prev`, `room:state` (state=reveal), DOM IDs in both pages
- `_Briefs/ke-gartik-phone-scope.md`

## What to build

### Mode detection
```js
const isHostPage = !!document.getElementById('reveal-panel');
const isAlbumPage = !!document.getElementById('album-root');
```
Only run one branch per page.

### Host-page branch (when `isHostPage`)
- Listen to `room:state`:
  - When `state.state === 'reveal'` or `'ended'`: unhide `#reveal-panel`, hide `#phase-status` and `#settings-panel`
  - Otherwise: hide `#reveal-panel`
- Listen to `reveal:slide` event:
  - Update `#reveal-image` (set src = slide.content if `slide.type === 'drawing'`, else hide), `#reveal-text` (show slide.content if text else empty), `#reveal-author` (`{author.emoji} {author.name}`)
  - `#reveal-position` ← `Album ${albumIdx+1}/${total.albums} · Slide ${slideIdx+1}/${total.slidesInAlbum}`
- Wire `#reveal-next` → emit `reveal:next`
- Wire `#reveal-prev` → emit `reveal:prev`
- Keyboard: arrow right = next, arrow left = prev (host only)

### Album-page branch (when `isAlbumPage`)
- Read code from `getRoomCodeFromPath()`
- Connect as a spectator: `emitAck('room:join', { code, name: 'Spectator', emoji: '👁️', resumePlayerId: storedId })`
  - Server-side note: this is a standard join. The host can also link this page after game ends.
- Listen to `room:state`. If `state.state !== 'reveal' && state.state !== 'ended'`, show "Game is not finished yet" in `#album-slide-text` and disable nav buttons.
- Otherwise, take ALBUMS from state. The server should include `albums` in `room:state` when `state === 'reveal'` or `'ended'`. **(NOTE: If Agent A did not include albums in the serialized state, file a request in `_Briefs/agent-D-done.md` — do not attempt to work around it locally.)**
- Maintain a local cursor `{ albumIdx, slideIdx }`. Don't drive it through `reveal:next`/`reveal:prev` (those are host-only); manage entirely client-side here.
- Render slides into `#album-slide-image`, `#album-slide-text`, `#album-slide-author`, `#album-position`.
- Wire `#album-next` / `#album-prev` to local navigation with bounds.

### Slide rendering helper
Shared rendering function with branch-specific element IDs as parameters:
- Drawing slide: show image, hide text
- Text slide: hide image, show text large

## Implementation notes
- Slide types: `'text'` (write/describe) shows text; `'drawing'` (draw/knockoff-draw) shows image
- Author lookup: in host branch, `reveal:slide` payload includes `author` directly. In album branch, look up via `state.players.find(p => p.id === slide.authorId)`. Fallback: `{name:'Anonymous', emoji:'🎭'}`.
- Use module imports from `socket-client.js`.

## Definition of done
- Host page shows reveal panel during reveal state and updates on next/prev clicks
- Standalone album page replays the entire game post-game
- Keyboard nav works on host
- File ownership respected — only `album.js`

## Report when done
Write `_Briefs/agent-D-done.md` with: files, gotchas, any contract clarifications needed.
