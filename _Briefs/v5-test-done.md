# v0.5 Test Agent — Done Report

File edited: `tests/smoke.js` (only file touched, per brief).

---

## Assertion 1 — Classic telephone structure (N=3)

**Where in the flow:** Inside `testMode()`, new step 10 (between the existing reveal:next exercise and cleanup), gated on `mode === 'classic'`.

**What it checks:**
- `albumCount === 3` (3 albums for 3 players)
- `totalSlides === 9` (3 albums × 3 slides each)

Both values are read from `state.albums` in the `room:state` payload (serialized by `rooms.js` when `state='reveal'` or `'ended'`), with fallback to `reveal:slide.total.albums` and `reveal:album.album.length` accumulators that the existing listener already populates.

**Expected output lines on success:**
```
Testing mode: classic      ... PASS  (Xs, layout=stepper, 3 albums, 9 slides)
  Classic structure PASS: albumCount=3 (expected 3)
  Classic structure PASS: totalSlides=9 (expected 9)
```

(Notes are printed when `result.pass` is true only if notes are non-empty; the structure PASS notes appear in the notes array and will print inline.)

**On failure:**
```
Testing mode: classic      ... FAIL
  Classic structure FAIL: expected 3 albums, got <N>
  Classic structure FAIL: expected 9 total slides (3×3), got <N>
```

---

## Assertion 2 — Reveal nav round-trip (v0.5 fix)

**Where in the flow:** Dedicated function `testRevealNavRoundTrip()`, called after the main 10-mode loop in `main()`, printed under the `--- v0.5 Reveal Navigation Round-Trip ---` banner. Does NOT affect the per-mode pass/fail counts; it controls the final `process.exit` code.

**What it does:**
1. Spins up a fresh 3-player classic game (separate room from the mode loop).
2. Walks `reveal:next` in a loop (capped at 15 steps) until `room:state` emits `state='ended'`.
3. Emits `reveal:prev` once.
4. Asserts `room:state` transitions back to `'reveal'` within 5 s.
5. Asserts `reveal:slide` is re-emitted within 5 s.
6. If both pass, walks `reveal:next` again until `'ended'` to confirm forward nav still works.

**Expected output lines on success:**
```
--- v0.5 Reveal Navigation Round-Trip ---
Testing reveal:prev from ended state... PASS  (Xs)
  Reached reveal state
  Reached 'ended' after N reveal:next(s)
  Reveal nav PASS: reveal:prev from 'ended' restored state to 'reveal'
  Reveal nav PASS: reveal:slide re-emitted after reveal:prev from 'ended'
  Reveal nav PASS: reveal:next after reveal:prev reached 'ended' again (step N)
```

**On failure (v0.5 fix not deployed):**
```
--- v0.5 Reveal Navigation Round-Trip ---
Testing reveal:prev from ended state... FAIL
  Reached reveal state
  Reached 'ended' after N reveal:next(s)
  Reveal nav FAIL: reveal:prev did not restore 'reveal' state (v0.5 fix not deployed?)
  Reveal nav FAIL: reveal:prev did not re-emit reveal:slide (v0.5 fix not deployed?)
```

---

## Resilience

- Every step uses `waitForEvent` with a `STEP_TIMEOUT = 5000` ms guard — no hangs.
- If the server hasn't been updated, the test fails clearly with the `(v0.5 fix not deployed?)` message within 10 s, then exits.
- The full exit code is: `0` only if all 10 modes pass AND the nav round-trip passes; `1` otherwise.

---

## Nothing felt wrong

Server already had the v0.5 guard fix applied in `server/game.js` (guards accept both `'reveal'` and `'ended'`; `reveal:prev` from `'ended'` restores `room.state = 'reveal'` and re-emits `reveal:slide`). The test is wired correctly against that behavior.
