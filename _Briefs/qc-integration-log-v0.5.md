# QC Integration Log — v0.5

Kons's notes after live-testing v0.4: PREV button dead during review; (perceived) not everyone drawing / round not ending early in Classic; plus a new request for more drawing tools (bucket + shapes).

## Built (3 parallel Sonnet agents + 1 QC verifier; orchestrated, no direct coding)

**CORE agent** — reveal navigation fix (server/game.js):
- reveal:next and reveal:prev guards now accept both 'reveal' AND 'ended' state (were 'reveal'-only, which killed both buttons the moment you clicked to the end).
- reveal:prev restores state to 'reveal' when navigating back from 'ended', across stepper / gallery / frame-cycle / scrollback layouts, and re-emits the slide/album so the host screen + standalone album page re-render.
- reveal:next still finishes at 'ended' and can reach it again after a prev.

**TEST agent** — smoke test extension (tests/smoke.js):
- Classic structure assertion: N=3 → 3 albums × 3 slides (9 total).
- Reveal-nav round-trip: walk to 'ended' → prev → assert state back to 'reveal' + slide re-emitted → next → 'ended' again. Fails fast (no hang) if the fix isn't deployed.

**CANVAS agent** — new drawing tools (public/js/canvas.js, public/css/styles.css):
- Tool selector added to the toolbar: Brush (default), Fill (bucket), Rectangle, Ellipse, Line.
- Flood fill: queue-based BFS (non-recursive), getImageData/putImageData, tolerance 32/channel, same-color no-op guard, one undo step.
- Shapes: snapshot on pointerdown → live preview on pointermove → commit on pointerup; each shape is one undo step; zero-drag tap is safe.
- Brush path byte-for-byte unchanged. No listener accumulation (initCanvas runs once; tool switch just flips a variable + CSS class). Tool switch mid-stroke aborts cleanly.
- clear/reset/loadImage/applyEraseRect/setStartImage/getDataUrl all still work; loadImage/clear reset shape-snapshot state. Works on both host page and phone players (canvas.js is shared).

## Classic mode "telephone" notes (verify-only, no code change)
Classic was ALREADY a correct telephone game: write→draw→describe→draw→… for N rounds, N albums, everyone active simultaneously (each on a different album chain). The v0.4 host-as-player fix resolved the earlier symptom where the idle host stalled a chain and blocked early advance. No code change needed; confirmed by reading classic.js + checkAllSubmitted.

## QC verifier result
Single verifier traced canvas (C1-C8), reveal nav (R1-R3), smoke test (S1-S3), CSS (X1). ALL PASS, 0 blocking issues, no regressions. Brush still draws normally; host-as-player canvas works; reveal:vote still accepts reveal/ended.

## Files touched
- server/game.js (reveal nav guards + prev-restore)
- tests/smoke.js (assertions)
- public/js/canvas.js (tools)
- public/css/styles.css (tool buttons)
- package.json → 0.5.0

## Deploy
push-to-github.bat → Render Manual Deploy → confirm /health + a live reveal prev/next + a fill/shape on a drawing.
