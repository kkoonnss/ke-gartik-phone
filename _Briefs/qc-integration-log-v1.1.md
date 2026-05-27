# QC Integration Log — v1.1 Sprint

Orchestrator (Opus) pass after the eight parallel sub-agents finished. Strategy: read each agent's `_done.md` file, spot-read the actual code, spawn a parallel QC verifier agent to deep-check 10 specific integration points, then fix what's broken.

## Sprint at a glance

8 agents in parallel:
- Agent A — server mode-dispatch refactor + 8 new mode strategies
- Agent B — canvas image-init + erase-rect
- Agent C — player UI for 5 new phase types
- Agent D — 4 reveal layouts
- Agent E — host UI for new modes
- Agent F — theming for new elements
- Agent G — backgrounds catalogue + prompt decks
- Agent H — smoke tester

A parallel QC verifier (a 9th Sonnet) audited 10 specific integration points and returned a structured PASS/FAIL per check.

## Bugs found and fixed

### 1. CSS class name divergence between Agent D (album.js) and Agent F (styles.css)
Agent D wrote class names like `.album-gallery`, `.gallery-tile`, `.scrollback-entry`, `.reveal-cycle__img`, `.reveal-cycle__frame-counter`, `.reveal-cycle__author-chip`. Agent F styled `.reveal-gallery__grid`, `.reveal-gallery__tile`, `.reveal-scroll__entry`, `.reveal-cycle__image`, `.reveal-cycle__counter`, `.reveal-cycle__author`. Class collision would have meant new reveal layouts shipped unstyled.

**Fix:** Renamed all class references in `public/js/album.js` to match Agent F's canonical names (which followed the BEM-ish `--variant__element` convention more rigorously). Added inline fallback styles for elements that didn't have CSS counterparts (`.reveal-cycle__frame-wrap`, `.reveal-cycle__frame-info`, `.reveal-cycle__album-pos`, `.gallery__prompt`, `.scrollback__header`, `.scrollback__empty`, `.reveal-cycle__empty`).

## Items flagged by QC verifier and accepted as-is

- **Theoretical race in play.js submit handling**: `hasSubmitted = false` is reset by the new phase:assignment handler. If a new assignment arrives mid-submit, the flag could clear before the old submit completes. In practice, the `submitInFlight` guard plus `clearAutoSubmit()` inside `doSubmit` prevent the actual double-submit scenario. Deferred.
- **Eraser-rect-without-prevImage silent drop in play.js**: Defensive guard. Per CONTRACT §9 this combo never occurs. Acceptable.
- **smoke.js phase:submit without ACK callback**: Tester won't catch server-side ack rejections. Fine for a smoke test that only verifies state transitions.
- **host.js background picker doesn't re-fetch on retry without page reload**: Intentional. `_bgLoaded` prevents re-fetch unless prior attempt failed.
- **story.js initialPhase has seconds but nextPhase doesn't include them**: game.js dispatcher has explicit `case 'continue': return s.writeSeconds;` in phaseSeconds() so this works.

## Items confirmed clean

- Mode interface contract honored by all 11 modes
- `pickEraseRect` signature compatible (3-arg call against 5-param defaulted definition)
- `BACKGROUNDS` array and `getById` properly exported
- `canvas.js` returns `{ getDataUrl, clear, loadImage, applyEraseRect, setStartImage }`
- `play.js` correctly awaits `setStartImage` before `applyEraseRect` for missing-piece
- `host.js` emits `room:seatorder`, `room:masterprompt`, `room:background` with correct payload shapes
- `host.js` reads `/api/backgrounds` response with the correct `{ backgrounds: [...] }` shape
- `smoke.js` correctly emits `phase:skip` for masterpiece mode
- `secret.js` uses `getSeatOrder` in BOTH `buildAlbums` AND `assignmentForPlayer`
- `story.js` correctly chains continue phases via `getPrevSlide`
- `reveal:next`/`reveal:prev` correctly routes per layout (stepper steps slide, gallery no-ops, frame-cycle/scrollback step album)
- `serializeRoom` includes all four new fields (`seatOrder`, `masterprompt`, `backgroundId`, `revealLayout`)
- `/api/backgrounds` and `/api/modes` REST endpoints present
- Solo mode bug fix: now starts at `draw` round 1 instead of wasted `write` phase
- 15-minute Masterpiece hard cap enforced in timer loop

## Open v2 items (not in scope for v1.1)

- Voting on funniest album at reveal end
- Persistent past-album archive (database)
- Discord OAuth
- Custom prompt deck upload
- Multi-language support
- Animation framerate configurable from host UI
- Story mode "pick from a starter prompt" option

## Files touched in QC

- `public/js/album.js` — class name rename
- `package.json` — version bump to 0.2.0
- `README.md` — new modes documented
- `_Briefs/qc-integration-log-v1.1.md` — this file
