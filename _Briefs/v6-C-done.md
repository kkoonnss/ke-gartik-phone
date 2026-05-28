# v6 Agent C — Done

## Save hook location

`public/js/album.js`, inside the HOST branch (`if (isHostPage)`) only.

Specifically: inside `socket.on('room:state', (state) => { ... })`, after the existing tallies-sync block and before the `if (inReveal)` layout block (lines ~591–624 after edits).

The hook fires when `inReveal && state.albums && state.albums.length` — i.e. state is `'reveal'` or `'ended'` with non-empty album data.

## Dedupe approach

Module-level variable `_archivedSignature` (string or null).

Signature format: `"${state.code}:${state.albums.length}:${firstAlbumLength}"` where `firstAlbumLength` is the number of slides in `state.albums[0]` (handles both raw-array and `{ slides: [] }` album shapes).

- Save only if computed signature differs from `_archivedSignature`.
- On save, immediately set `_archivedSignature = sig` before the async call so rapid re-fires during the same reveal are all blocked.
- Reset to `null` when `state.state === 'lobby'` or `'playing'` so the next game is saved fresh.

`saveGame()` is wrapped in `try/catch` + `.catch()` to ensure any IndexedDB failure is a silent `console.warn` only — never disrupts the reveal UI.

## Import

Top-level ES module static import at the top of album.js:
```js
import { saveGame } from '/js/album-store.js';
```
The import runs on both host.html and album.html (both load album.js), but `saveGame` is only ever *called* inside the HOST branch socket listener, so the album standalone page is not affected.

## Navigation links added

- `public/host.html`: `<a href="/past.html" class="host__past-link">Past Albums</a>` inserted as last child of `<header class="host__header">`.
- `public/index.html`: `<a href="/past.html" class="host__past-link">View Past Albums</a>` inside a `<div class="lobby__past">` block, last child of `<div id="landing" class="lobby__card">` (after the join form, before closing `</div>`).

Both use class `host__past-link` as specified — Agent D styles this class in styles.css.
