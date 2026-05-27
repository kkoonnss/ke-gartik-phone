# QC Integration Log — v0.3 Sprint

The v0.3 sprint combined: (1) a full project audit, (2) Pass 1 to fix every audit finding, (3) Pass 2 to ship the deferred v2 features. Eight Sonnet sub-agents in two parallel waves, plus two QC verifier agents.

## Sprint summary

**Audit (1 deep-dive auditor agent)** produced `ARCHITECTURE_OVERVIEW.md` and `PROJECT_AUDIT.md`. Found 3 HIGH, 7 MEDIUM, 7 LOW risks. Critical: canvas pointer-listener accumulation that corrupts drawings by round 5+.

**Pass 1 — Bug fixes (4 agents in parallel)**:
- FIX-A (server): H-1 mutex, H-2 try/catch removal, H-3 mid-game-join block, M-3 getSeatOrder consistency, M-4 comment, M-6 knockoff-show submit reject, L-1 dead IIFE, M-5 `/api/room/:code` endpoint, plus four new v2 server events (`reveal:vote`, `room:prompts`, `room:kick`, `room:animation-fps`)
- FIX-B (canvas + play.js): M-1 canvas listener refactor — `initCanvas` runs once, `reset()` clears state without re-binding; M-2 spectator-screen flash race; L-3 + L-4 comments + placeholder; sound trigger hooks; kicked banner handler
- FIX-C (host.js): M-7 listeners moved inside `init()`; L-6 secret drag guard flag
- FIX-D (album.js): M-5 standalone page uses REST endpoint not socket join; 30s auto-refresh; download-as-PNG button

**Pass 1 QC verifier**: all fixes PASS except L-2 (imageutils.js stub deletion, deferred — file is a harmless stub with explanatory comment).

**Pass 2 — v2 features (4 agents in parallel)**:
- FEAT-HOST: vote tally panel + winners gallery + kick buttons + custom prompts textarea + animation FPS slider (all `#m-*` IDs)
- FEAT-PLAY: vote panel on `#spectator-screen` during reveal with `reveal:slide`/`reveal:album`/`vote:tally` listeners
- FEAT-ALB: vote badges on all four reveal layouts + winners gallery for ended state + vote counts in PNG export
- FEAT-SND-CSS: `public/js/sounds.js` (Tone.js lazy-load, opt-in via localStorage) + full CSS for every new class

**Pass 2 final QC**: integration flows verified end-to-end (voting flow, kick flow, custom prompts flow, animation FPS flow, winners gallery, sound effects, spectator REST endpoint, class name coverage).

## Bugs surfaced and fixed during QC

- CSS class name divergence (carried over from v0.2): closed during Pass 1 reconciliation pass.
- imageutils.js never deleted (L-2): deferred — file is a stub with explanatory comment, safe to leave.

## Items confirmed clean by both QC passes

- `_advancing` mutex on `advancePhase` and `checkAllSubmitted`
- `joinRoom` blocks new players when state !== 'lobby'
- Canvas pointer listeners attached exactly once per `initCanvas`
- `serializeRoom` includes `customPrompts`, `votes.perAlbum` (public, no `perPlayer`), `settings.animationFps`
- All four reveal layouts continue to work
- Standalone `/album/:code` page no longer consumes a player slot
- Vote privacy: `perPlayer` only emitted to that player's socket via `vote:tally`
- All new CSS classes have matching styles
- `prefers-reduced-motion` honored on all new animations
- Sound module defensively no-ops if Tone.js CDN fails

## Open v3+ items (architecture supports cleanly)

- Persistent album archive across server restarts (would need SQLite or file-based persistence)
- Discord OAuth + community deck library
- Multi-language UI
- Real-time emoji reactions during reveal (separate from voting)
- Voice/video link integration (e.g., embed a Zoom invite QR alongside the room QR)

## Sprint files touched

| Area | Files |
|---|---|
| Server | `server/game.js`, `server/rooms.js`, `server/index.js`, `server/modes/*.js`, `server/backgrounds.js`, `server/imageutils.js` (stub) |
| Client | `public/js/canvas.js`, `public/js/play.js`, `public/js/host.js`, `public/js/album.js`, `public/js/sounds.js` (new) |
| Markup | `public/host.html` (additive) |
| Style | `public/css/styles.css`, `public/css/theme.css` |
| Docs | `_Briefs/CONTRACT_v3.md`, `_Briefs/ARCHITECTURE_OVERVIEW.md`, `_Briefs/PROJECT_AUDIT.md`, this log |
| Version | `package.json` 0.2.0 → 0.3.0 |
