# QC Integration Log — v0.6 (bundles v0.5)

This deploy ships v0.5 (never deployed separately) + v0.6 together.

## v0.5 (from prior sprint, in this deploy)
- Reveal PREV/NEXT now work in 'ended' state; prev from end re-enters review. (server/game.js)
- New canvas tools: Fill (bucket), Rectangle, Ellipse, Line + Brush. (canvas.js, styles.css)
- Smoke test extended for reveal nav round-trip + classic structure. (tests/smoke.js)
- QC: all PASS, 0 blocking.

## v0.6 — Album Archive (client-side IndexedDB)
Built by 4 parallel Sonnet agents + 1 QC verifier + 1 CSS polish agent. Orchestrated; no direct logic coding.

- **album-store.js** (new): IndexedDB CRUD (saveGame/listGames/getGame/deleteGame/clearAll/stats). DB 'gartik-archive', store 'games'. Degrades to no-op if IndexedDB unavailable.
- **past.html + past.js** (new): "Past Albums" page — lists saved game nights as cards (mode, date, players, albums), Replay with album+slide navigation, Delete with confirm, empty state. Text via textContent (no injection).
- **album.js** host branch: saves the game to the archive once per game when reveal/ended with albums present; dedupe signature; try/catch so a save failure never disrupts reveal. Phone players + standalone /album page untouched.
- **host.html + index.html**: "Past Albums" link (class host__past-link).
- **styles.css**: full archive page styling + CSS-polish pass (header/title/nav-label/slide-img cap/card-meta) + removed double-.archive nesting.

### Design decision
Client-side IndexedDB (host browser), NOT a server DB. Rationale: Render free tier wipes disk on restart, so durable server storage needs a paid plan or a 3rd-party DB account+secrets (signup friction). Browser storage survives restarts, needs no account, deploys instantly. Tradeoff: archive is per-host (the host keeps their game-night history); cross-device shared archive is a future server-DB upgrade.

### QC result
Functionally PASS, no regressions (host reveal, standalone album page, phone players all unaffected). All required CSS classes styled. 7 helper classes + a double-container nesting were unstyled/cosmetic — fixed in the polish pass (notably capped the replay image so it can't blow out the layout).

## Acceptance (verify live after deploy)
1. Finish a game on the host browser → /past.html shows it as a card.
2. Replay navigates albums + slides; drawings + text render; authors labeled.
3. Delete works; archive survives a browser reload / server restart.
4. Saving never disrupts the reveal; if IndexedDB is off, the game still plays.
5. Phone players + standalone /album/:code unchanged.

## Files touched (v0.5 + v0.6)
- server/game.js (v0.5 reveal nav)
- public/js/canvas.js, public/css/styles.css (v0.5 tools + v0.6 archive styling)
- tests/smoke.js (v0.5)
- public/js/album-store.js (new), public/past.html (new), public/js/past.js (new)
- public/js/album.js, public/host.html, public/index.html (archive save + links)
- package.json → 0.6.0

## Deploy
push-to-github.bat → Render Manual Deploy → confirm /health + reveal prev + a fill/shape + finish a game and open /past.html.
