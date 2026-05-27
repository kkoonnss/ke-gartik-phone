# v2 Agent H — Done

## Files Written

### `tests/smoke.js` (new, ~350 lines)
Full Node CLI smoke tester. Connects 3 fake socket.io clients per mode and walks the full
lifecycle: create room → join → configure → game:start → phase:submit loop → reveal → reveal:next.

### `package.json` (additive changes only)
- Added `"scripts.test": "node tests/smoke.js"`
- Added `"devDependencies": { "socket.io-client": "^4.7.5" }`
- All other fields untouched.

---

## Modes Covered

All 10 modes attempted in order:

| Mode        | Expected Layout | Notes |
|-------------|-----------------|-------|
| classic      | stepper         | Fully covered |
| knockoff     | stepper         | knockoff-show handled (no submit, waits for auto-advance) |
| solo         | gallery         | Single draw phase; gallery reveal |
| story        | scrollback      | continue phases submit text |
| animation    | frame-cycle     | draw phases submit JPEG frames |
| coop         | stepper         | coop-draw phases submit JPEG |
| masterpiece  | gallery         | masterpiece-draw: TestA emits phase:skip after 500ms |
| missingpiece | stepper         | missingpiece-draw phases submit JPEG |
| background   | gallery         | room:masterprompt + room:background set before start |
| secret       | stepper         | room:seatorder set (B, C, A order) |

---

## Modes That May Need Manual Testing / May Show FAIL on First Run

**story, animation, coop, masterpiece, missingpiece, background, secret** will FAIL until
Agent A completes the `game.js` refactor wiring all mode modules into the dispatcher.

Current state of server at time of writing:
- `game.js` is still the v1 dispatcher supporting only `classic`, `knockoff`, `solo`
- `validModes` in `room:settings` handler is `['classic', 'knockoff', 'solo']` — new modes
  will silently fall back to classic if server validation rejects them
- `serializeRoom` does not yet include `revealLayout`, `seatOrder`, `masterprompt`, `backgroundId`

The tester handles both states gracefully:
- If `revealLayout` is missing from `room:state`, it logs a soft warning and infers from the
  mode name rather than hard-failing
- If a mode runs as classic (server fell back), it will still reach reveal — just with
  layout mismatch noted in the FAIL reason

**Expected passing before Agent A is complete:** classic, knockoff, solo (3/10)
**Expected passing after Agent A completes:** all 10/10

---

## Tiny JPEG Note

The hardcoded `TINY_JPEG` constant in `smoke.js` is a real 32x32 white JPEG data URI embedded
inline. It satisfies the server validator: `content.startsWith('data:image/jpeg;base64,')`.

---

## Run Command

After installing devDependencies and starting the server:

```
cd /d "C:\Users\Kons\Documents\_KE_VibeApps\KE_GartiK_Phone"
npm install
run-local.bat
```

Then in a second terminal:
```
cd /d "C:\Users\Kons\Documents\_KE_VibeApps\KE_GartiK_Phone"
npm test
```

Or directly:
```
cd /d "C:\Users\Kons\Documents\_KE_VibeApps\KE_GartiK_Phone" && node tests/smoke.js
```
