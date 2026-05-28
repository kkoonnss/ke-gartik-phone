# v6-A-done.md — Agent A: album-store.js

## File delivered
`public/js/album-store.js` — ES module, no dependencies, no build step.

## Exported functions (CONTRACT_v6 §1 — locked interface)

| Function | Signature | Returns |
|---|---|---|
| `saveGame` | `({ code, mode, playedAt, players, albums })` | `Promise<number\|null>` — new record id, or null if unavailable |
| `listGames` | `()` | `Promise<[{ id, code, mode, playedAt, playerCount, albumCount }]>` — metadata only, newest first |
| `getGame` | `(id)` | `Promise<{ id, code, mode, playedAt, players, albums } \| null>` |
| `deleteGame` | `(id)` | `Promise<void>` |
| `clearAll` | `()` | `Promise<void>` |
| `stats` | `()` | `Promise<{ count: number }>` |

## IndexedDB schema

- **Database name:** `gartik-archive`
- **Version:** 1
- **Object store:** `games`
  - `keyPath`: `id` (autoIncrement integer — IDB supplies it)
  - **Index:** `playedAt` (non-unique) — used for `prev`-direction cursor to return newest-first without a sort pass

## Unavailability handling

1. `openDB()` wraps `indexedDB.open(...)` in a try/catch and handles `onerror` + `onblocked`. If IndexedDB is absent (`typeof indexedDB === 'undefined'`) or throws, it resolves to `null`.
2. The cached `_dbPromise` is only set once; a null result is cached too so there is no repeated retry overhead.
3. Every exported function checks `if (!db) return <safe default>` before touching the store:
   - `saveGame` → returns `null` (caller ignores return value per Agent C's try/catch wrapper)
   - `listGames` → returns `[]`
   - `getGame` → returns `null`
   - `deleteGame`, `clearAll` → return `undefined` (no-op)
   - `stats` → returns `{ count: 0 }`
4. Each function additionally wraps its body in `try/catch` so any unexpected IDB error is swallowed without propagating to the caller.

## listGames metadata derivation

The cursor iterates all records but pushes only `{ id, code, mode, playedAt, playerCount, albumCount }` into the result array — `playerCount` = `players.length`, `albumCount` = `albums.length`. The heavy album blob arrays are never copied into the result.

## Notes
- Albums stored exactly as received (flat Slide arrays). No transformation.
- `playedAt` is a number (Date.now()) supplied by the caller; formatting is left to the UI layer (Agent B).
- No server changes, no new npm deps.
