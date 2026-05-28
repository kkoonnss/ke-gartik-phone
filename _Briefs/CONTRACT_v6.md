# CONTRACT_v6.md — Album Archive (client-side, locked)

Feature: persistent album archive so the host can revisit past game nights. Stored client-side in the host browser via **IndexedDB** (survives server restarts/sleeps, no account, no server DB, no secrets). Deploys safely on Render free tier. Tradeoff: archive lives on the host's browser only (per-host history); cross-device sharing is a future server-DB upgrade, out of scope here.

All changes are additive. No server logic changes required (express.static already serves new HTML at /past.html). No new server events.

---

## 1. Locked storage interface — `public/js/album-store.js` (NEW, Agent A)

ES module. IndexedDB-backed. DB name `gartik-archive`, object store `games` (keyPath `id`, autoIncrement), index `playedAt`.

Export EXACTLY these async functions:

```js
// Save a completed game. Returns the new record id.
export async function saveGame({ code, mode, playedAt, players, albums }) // -> Promise<number>
//   code: string room code
//   mode: string mode id (e.g. 'classic')
//   playedAt: number (Date.now()) — caller sets it
//   players: [{ id, name, emoji, color }]  (lightweight, for author lookup on replay)
//   albums: Album[]  where Album = Slide[] and Slide = { type:'text'|'drawing', content, authorId, round, phase }
//   (store the albums EXACTLY as received — flat arrays per the app's contract)

// List saved games, metadata only (no album payloads — keep it light), NEWEST FIRST.
export async function listGames() // -> Promise<[{ id, code, mode, playedAt, playerCount, albumCount }]>

// Full record for replay.
export async function getGame(id) // -> Promise<{ id, code, mode, playedAt, players, albums } | null>

// Delete one game.
export async function deleteGame(id) // -> Promise<void>

// Wipe the whole archive.
export async function clearAll() // -> Promise<void>

// Optional convenience: total count + rough byte size for a "storage used" display.
export async function stats() // -> Promise<{ count: number }>
```

Requirements:
- All functions open the DB lazily (cache the connection). Handle the `onupgradeneeded` to create the store + index.
- If IndexedDB is unavailable (private mode, old browser), functions must NOT throw — `saveGame` resolves silently (no-op), `listGames`/`getGame` resolve to `[]`/`null`. Never crash the page.
- `listGames` must derive `playerCount` from players.length and `albumCount` from albums.length WITHOUT loading the full album blobs into the returned metadata (load record, compute counts, return metadata only — acceptable for tens of games).
- Newest-first ordering by `playedAt`.

---

## 2. Browse + replay page — `public/past.html` + `public/js/past.js` (NEW, Agent B)

`past.html`: a standalone page (loads theme.css + styles.css). Structure:
- Header: "MONDAY MEETING · PAST ALBUMS" + a link back to `/` ("New Game").
- `#archive-list` — container for game cards (populated by past.js).
- `#archive-replay` — hidden container for replaying a selected game's albums (populated by past.js).
- An "empty state" message element shown when there are no saved games.

`past.js` (ES module):
- Import from `./album-store.js`: `listGames`, `getGame`, `deleteGame`.
- On load: render the list of saved games as cards. Each card shows: mode name, date (format playedAt as a friendly local date/time), player count, album count, a "Replay" button, and a "Delete" (×) button (with confirm()).
- Replay: on "Replay", load the full game via getGame(id), then render its albums. Reuse a SIMPLE self-contained slide renderer (don't import album.js): for each album, show its slides in sequence with prev/next buttons, OR show a scrollable gallery of all slides. Author names resolved from the saved `players` array (fallback "Anonymous"). Drawing slides = `<img src=content>`, text slides = the text. Include album navigation (Album X/Y) + slide navigation within an album.
- Delete: confirm, deleteGame(id), re-render the list.
- Empty state: if listGames() returns [], show "No saved games yet — host a game and it'll appear here."

Use class names that Agent D will style: `.archive`, `.archive__card`, `.archive__card-meta`, `.archive__card-actions`, `.archive__replay`, `.archive__slide`, `.archive__nav`, `.archive__empty`, `.archive__delete`, `.archive__replay-btn`, `.archive__back`. (Agent D styles these.)

---

## 3. Save hook + navigation links — `public/js/album.js` + `public/host.html` (Agent C)

In `album.js` HOST branch only (isHostPage):
- Import `saveGame` from `./album-store.js`.
- When the host's room reaches a completed state with album data available — specifically when `room:state` arrives with `state.state === 'reveal' OR 'ended'` AND `state.albums` is a non-empty array — save the game ONCE per game:
  - Guard against duplicate saves for the same game (e.g., track a `_savedThisGame` flag keyed by room code + a hash/length signature, reset when a new game starts i.e. state returns to 'lobby' or 'playing').
  - Call `saveGame({ code: state.code, mode: state.settings.mode, playedAt: Date.now(), players: state.players.map(p=>({id,name,emoji,color})), albums: state.albums })`.
  - Wrap in try/catch — a save failure must never disrupt the reveal.
- Do NOT change the phone-player branch.

Navigation links (Agent C owns these edits):
- `public/host.html`: add a small "Past Albums" link (anchor to `/past.html`, `target="_blank"` or same tab — your call) somewhere unobtrusive in the host header or near the room code. Class `.host__past-link`.
- Also acceptable to add the same link to `public/index.html` lobby (a small "View Past Albums" link). If you edit index.html, that's within Agent C's ownership for this task.

File ownership for Agent C: `public/js/album.js`, `public/host.html`, `public/index.html`. (No other agent touches these in this sprint.)

IMPORTANT: album.js currently has the host branch + standalone-album branch. Only add the save hook in the HOST branch's room:state handler. Don't break existing reveal rendering or the standalone /album/:code page.

---

## 4. Theming — `public/css/styles.css` (Agent D)

Add styles for the archive page classes from §2 and the nav link from §3:
- `.archive` page container, `.archive__card` (game-night card: dark, bordered, hover lift), `.archive__card-meta` (mode/date/counts), `.archive__card-actions`, `.archive__replay-btn` (primary), `.archive__delete` (subtle × → red on hover), `.archive__replay` (replay viewport), `.archive__slide` (image/text slide display), `.archive__nav` (prev/next), `.archive__empty` (centered dim empty state), `.archive__back` (back link).
- `.host__past-link` — small unobtrusive link styling matching the host header.
- Responsive: cards wrap in a grid on wide screens, single column on phones. Match the existing dark + bold + accent (#FFD400) aesthetic. Honor prefers-reduced-motion.

File ownership: ONLY `public/css/styles.css`.

---

## 5. File Ownership Summary

| Agent | Owns |
|---|---|
| A | `public/js/album-store.js` (new) |
| B | `public/past.html` (new), `public/js/past.js` (new) |
| C | `public/js/album.js`, `public/host.html`, `public/index.html` |
| D | `public/css/styles.css` |

All disjoint. No server files change. No new npm deps.

---

## 6. Acceptance Criteria
1. After a game ends, opening `/past.html` on the host's browser shows that game as a card (mode, date, players, albums).
2. Clicking Replay shows the albums with working album + slide navigation; drawings and text render; authors labeled.
3. Delete removes a game (with confirm) and the list updates.
4. Archive survives a full server restart / browser reload (IndexedDB is durable).
5. Saving never disrupts the live reveal; if IndexedDB is unavailable, the game still plays and reveals normally (archive just stays empty).
6. The phone player experience and the standalone /album/:code page are UNCHANGED.
7. "Past Albums" link is reachable from the host page (and optionally lobby).
8. No duplicate saves for the same game; a new game saves as a new record.

## 7. Notes
- Albums contain base64 JPEG drawings — can be sizable. IndexedDB handles MBs fine (unlike localStorage). Don't attempt to also mirror to localStorage.
- playedAt formatting: friendly local string (e.g., "May 26, 2026, 11:40 PM"). Use toLocaleString().
- Version bumps to 0.6.0 after QC (orchestrator handles).

If anything feels wrong, STOP and report rather than diverging.
